import { McpError, ErrorCode } from '../lib/utils';
import { createAxiosInstance, getAuthHeaders, getBaseUrl, return_error } from '../lib/utils';
import { AxiosError } from 'axios';

let csrfToken: string | null = null;
let cookies: string | null = null;

async function fetchCsrfToken(baseUrl: string): Promise<string> {
    const response = await createAxiosInstance()({
        method: 'GET',
        url: `${baseUrl}/sap/bc/adt/discovery`,
        headers: {
            ...(await getAuthHeaders()),
            'x-csrf-token': 'fetch'
        }
    });
    if (response.headers['set-cookie']) {
        cookies = response.headers['set-cookie'].join('; ');
    }
    const token = response.headers['x-csrf-token'];
    if (!token) throw new Error('No CSRF token in response');
    return token;
}

async function dataPreviewRequest(tableName: string, maxRows: number): Promise<string> {
    const baseUrl = String(await getBaseUrl());

    if (!csrfToken) {
        csrfToken = await fetchCsrfToken(baseUrl);
    }

    const buildHeaders = async () => {
        const h: any = {
            ...(await getAuthHeaders()),
            'Accept': 'application/vnd.sap.adt.datapreview.table.v1+xml',
            'x-csrf-token': csrfToken
        };
        if (cookies) h['Cookie'] = cookies;
        return h;
    };

    const config = {
        method: 'POST' as const,
        url: `${baseUrl}/sap/bc/adt/datapreview/ddic`,
        headers: await buildHeaders(),
        params: { ddicEntityName: tableName, rowNumber: maxRows },
        timeout: 30000
    };

    try {
        const response = await createAxiosInstance()(config);
        return response.data;
    } catch (error) {
        if (error instanceof AxiosError && error.response?.status === 403) {
            csrfToken = await fetchCsrfToken(baseUrl);
            config.headers = await buildHeaders();
            const response = await createAxiosInstance()(config);
            return response.data;
        }
        throw error;
    }
}

function parseDataPreviewXml(xml: string, tableName: string): string {
    const columnRegex = /<dataPreview:columns>([\s\S]*?)<\/dataPreview:columns>/g;
    const nameRegex = /dataPreview:name="([^"]+)"/;
    const descRegex = /dataPreview:description="([^"]+)"/;
    const totalRowsMatch = xml.match(/<dataPreview:totalRows>(\d+)<\/dataPreview:totalRows>/);
    const totalRows = totalRowsMatch ? totalRowsMatch[1] : '?';

    const columns: { name: string; description: string; values: string[] }[] = [];

    let colMatch;
    while ((colMatch = columnRegex.exec(xml)) !== null) {
        const colContent = colMatch[1];
        const nm = nameRegex.exec(colContent);
        const desc = descRegex.exec(colContent);

        const values: string[] = [];
        const dataSetMatch = colContent.match(/<dataPreview:dataSet>([\s\S]*?)<\/dataPreview:dataSet>/);
        if (dataSetMatch) {
            const dataItemRegex = /<dataPreview:data>([\s\S]*?)<\/dataPreview:data>/g;
            let dm;
            while ((dm = dataItemRegex.exec(dataSetMatch[1])) !== null) {
                values.push(dm[1]);
            }
        }

        columns.push({
            name: nm ? nm[1] : '?',
            description: desc ? desc[1] : '',
            values
        });
    }

    if (columns.length === 0) {
        return `Table ${tableName}: No columns found.\n\nRaw:\n${xml.substring(0, 2000)}`;
    }

    const rowCount = columns[0]?.values.length || 0;

    let output = `Table: ${tableName} (${totalRows} total rows, showing ${rowCount})\n\n`;
    output += columns.map(c => c.name).join(' | ') + '\n';
    output += columns.map(c => '-'.repeat(Math.max(c.name.length, 4))).join(' | ') + '\n';

    for (let i = 0; i < rowCount; i++) {
        output += columns.map(c => c.values[i] || '').join(' | ') + '\n';
    }

    return output;
}

export async function handleGetTableContents(args: any) {
    try {
        if (!args?.table_name) {
            throw new McpError(ErrorCode.InvalidParams, 'Table name is required');
        }
        const maxRows = args.max_rows || 100;
        const tableName = args.table_name.toUpperCase();

        const xml = await dataPreviewRequest(tableName, maxRows);
        const parsed = parseDataPreviewXml(xml, tableName);

        return {
            isError: false,
            content: [{ type: 'text', text: parsed }]
        };
    } catch (error) {
        return return_error(error);
    }
}

#!/usr/bin/env node
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { handleGetProgram } from './handlers/handleGetProgram.js';
import { handleGetClass } from './handlers/handleGetClass.js';
import { handleGetFunctionGroup } from './handlers/handleGetFunctionGroup.js';
import { handleGetFunction } from './handlers/handleGetFunction.js';
import { handleGetTable } from './handlers/handleGetTable.js';
import { handleGetStructure } from './handlers/handleGetStructure.js';
import { handleGetTableContents } from './handlers/handleGetTableContents.js';
import { handleGetPackage } from './handlers/handleGetPackage.js';
import { handleGetInclude } from './handlers/handleGetInclude.js';
import { handleGetTypeInfo } from './handlers/handleGetTypeInfo.js';
import { handleGetInterface } from './handlers/handleGetInterface.js';
import { handleGetTransaction } from './handlers/handleGetTransaction.js';
import { handleSearchObject } from './handlers/handleSearchObject.js';

function extractText(result: { content?: { text?: string }[] }): string {
  if (result?.content?.[0]?.text) return result.content[0].text;
  return JSON.stringify(result, null, 2);
}

function formatXml(xml: string, cmd: string): string {
  // Transaction
  if (cmd === 'transaction') {
    const name = xml.match(/name="([^"]+)"/)?.[1] || '?';
    const text = xml.match(/text="([^"]+)"/)?.[1] || '?';
    const pkg = xml.match(/package="([^"]+)"/)?.[1] || '?';
    const appLines: string[] = [];
    const appRegex = /facet="APPL"[^>]*name="([^"]+)"[^>]*displayName="([^"]+)"[^>]*text="([^"]+)"/g;
    let m;
    while ((m = appRegex.exec(xml)) !== null) appLines.push(`  ${m[2]} — ${m[3]}`);
    return `\nTransaccao: ${name}\nDescricao:  ${text}\nPacote:     ${pkg}\n\nComponente aplicacao:\n${appLines.join('\n')}`;
  }

  // Table structure
  if (cmd === 'table') {
    const fields: string[] = [];
    const fieldRegex = /<field[^>]*name="([^"]*)"[^>]*type="([^"]*)"[^>]*description="([^"]*)"/g;
    let m;
    while ((m = fieldRegex.exec(xml)) !== null) fields.push(`  ${m[1].padEnd(25)} ${m[2].padEnd(15)} ${m[3]}`);
    if (fields.length) {
      return `\n${'Campo'.padEnd(25)} ${'Tipo'.padEnd(15)} Descricao\n${'─'.repeat(70)}\n${fields.join('\n')}`;
    }
    // Fallback: try ADT format
    const cols: string[] = [];
    const colRegex = /adtcore:name="([^"]+)"[^>]*adtcore:type="([^"]*)"/g;
    while ((m = colRegex.exec(xml)) !== null) cols.push(`  ${m[1].padEnd(30)} ${m[2]}`);
    if (cols.length) return `\n${'Nome'.padEnd(30)} Tipo\n${'─'.repeat(50)}\n${cols.join('\n')}`;
  }

  // Search results
  if (cmd === 'search') {
    const results: string[] = [];
    const objRegex = /name="([^"]+)"[^>]*description="([^"]*)"[^>]*type="([^"]*)"/g;
    let m;
    while ((m = objRegex.exec(xml)) !== null) results.push(`  ${m[1].padEnd(35)} ${m[3].padEnd(15)} ${m[2]}`);
    if (results.length) return `\nResultados: ${results.length}\n\n${'Nome'.padEnd(35)} ${'Tipo'.padEnd(15)} Descricao\n${'─'.repeat(70)}\n${results.join('\n')}`;
  }

  // If not XML or no special formatting, return as-is
  if (!xml.startsWith('<?xml') && !xml.startsWith('<')) return xml;

  // Generic: strip XML tags for readability
  return xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function help() {
  console.log(`
sap - SAP S/4HANA CLI (via ADT API)

Uso: sap <comando> <argumento> [opcoes]

Comandos:
  program <nome>                    Codigo fonte de programa ABAP
  class <nome>                      Codigo fonte de classe ABAP
  function <nome> <grupo>           Codigo fonte de modulo de funcao
  funcgroup <nome>                  Codigo fonte de grupo de funcoes
  include <nome>                    Codigo fonte de include
  interface <nome>                  Codigo fonte de interface

  table <nome>                      Estrutura de tabela SAP
  contents <nome> [--rows N]        Conteudo de tabela (default 100 linhas)
  structure <nome>                  Estrutura ABAP (DDIC)

  search <query> [--max N]          Pesquisar objectos (usar * como wildcard)
  transaction <nome>                Detalhes de transaccao
  package <nome>                    Detalhes de pacote
  typeinfo <nome>                   Info de tipo ABAP

Exemplos:
  sap search "ZENH*" --max 20
  sap table USR02
  sap contents USR02 --rows 10
  sap program RSUSR002
  sap class CL_GUI_ALV_GRID
  sap function BAPI_USER_GET_DETAIL SYST
  sap transaction SU01
  sap structure BAPIRET2
`);
}

function getFlag(args: string[], flag: string, def: number): number {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? parseInt(args[i + 1]) : def;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') { help(); return; }

  try {
    const cmd = args[0];
    const arg1 = args[1];
    const arg2 = args[2];

    if (!arg1 && cmd !== '--help') {
      console.error(`Erro: argumento em falta. Use 'sap --help' para ver os comandos.`);
      process.exit(1);
    }

    let result: unknown;

    switch (cmd) {
      case 'program':
        result = await handleGetProgram({ program_name: arg1 });
        break;
      case 'class':
        result = await handleGetClass({ class_name: arg1 });
        break;
      case 'function':
        if (!arg2) { console.error('Erro: sap function <nome> <grupo>'); process.exit(1); }
        result = await handleGetFunction({ function_name: arg1, function_group: arg2 });
        break;
      case 'funcgroup':
        result = await handleGetFunctionGroup({ function_group: arg1 });
        break;
      case 'include':
        result = await handleGetInclude({ include_name: arg1 });
        break;
      case 'interface':
        result = await handleGetInterface({ interface_name: arg1 });
        break;
      case 'table':
        result = await handleGetTable({ table_name: arg1 });
        break;
      case 'contents':
        result = await handleGetTableContents({ table_name: arg1, max_rows: getFlag(args, '--rows', 100) });
        break;
      case 'structure':
        result = await handleGetStructure({ structure_name: arg1 });
        break;
      case 'search':
        result = await handleSearchObject({ query: arg1, maxResults: getFlag(args, '--max', 50) });
        break;
      case 'transaction':
        result = await handleGetTransaction({ transaction_name: arg1 });
        break;
      case 'package':
        result = await handleGetPackage({ package_name: arg1 });
        break;
      case 'typeinfo':
        result = await handleGetTypeInfo({ type_name: arg1 });
        break;
      default:
        console.error(`Comando desconhecido: ${cmd}`);
        help();
        process.exit(1);
    }

    const text = extractText(result as { content?: { text?: string }[] });
    console.log(formatXml(text, cmd));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`Erro: ${msg}`);
    process.exit(1);
  }
}

main();

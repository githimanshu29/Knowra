// Test script to verify document parsing and metadata extraction
import { parseDocument } from '../services/ingestion/parsers.js';

async function main() {
  console.log('Testing Document Parsers and Metadata Extraction...');

  // 1. Test Markdown Parsing with Heading Hierarchy
  const sampleMarkdown = Buffer.from(
    '# Employee Handbook\n\nWelcome to Acme Corp.\n\n## Leave Policy\n\nEmployees get 20 days paid leave.\n\n### Maternity Benefit\n\nFemale staff gets 26 weeks paid leave.'
  );

  const mdResult = await parseDocument(
    sampleMarkdown,
    'handbook.md',
    'text/markdown',
    'role_restricted'
  );

  console.log('1. Markdown Parser Test:');
  console.log('   Source:', mdResult.source);
  console.log('   DocType:', mdResult.docType);
  console.log('   AccessLevel:', mdResult.accessLevel);
  console.log('   Timestamp:', mdResult.timestamp);
  console.log('   Extracted Blocks Count:', mdResult.blocks.length);
  console.log('   First Block Heading Path:', mdResult.blocks[1]?.metadata.headingPath);

  // 2. Test CSV Parsing with Table Headers Preservation
  const sampleCsv = Buffer.from(
    'Policy Name,Allowed Days,Pay Status\nMaternity Leave,180,Paid\nPaternity Leave,15,Paid\nBereavement,5,Paid'
  );

  const csvResult = await parseDocument(
    sampleCsv,
    'leaves.csv',
    'text/csv',
    'public_tenant'
  );

  console.log('\n2. CSV Table Parser Test:');
  console.log('   Source:', csvResult.source);
  console.log('   DocType:', csvResult.docType);
  console.log('   AccessLevel:', csvResult.accessLevel);
  console.log('   Rows Parsed into Semantic Blocks:', csvResult.blocks.length);
  console.log('   Sample Semantic Table Row:');
  console.log('  ', csvResult.blocks[0]?.content);
}

main();

// Optional: read an uploaded invoice / statement / certificate with Claude and propose rows
// for a section. Enabled only when ANTHROPIC_API_KEY is set. Results are always shown to the
// user for review before anything is saved.

const fs = require('fs');

const enabled = () => Boolean(process.env.ANTHROPIC_API_KEY);
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

function canExtract(doc) {
  return enabled() && (doc.mime === 'application/pdf' || IMAGE_TYPES.includes(doc.mime) || doc.mime === 'text/csv' || doc.mime === 'text/plain');
}

function fieldSpec(section) {
  return section.fields.map((f) => {
    let t = f.type === 'number' ? 'number (Sri Lankan rupees unless the field says otherwise; no commas)' : f.type === 'date' ? 'date YYYY-MM-DD' : f.type === 'checkbox' ? 'boolean' : 'string';
    if (f.options) t += ` — one of: ${f.options.join(' | ')}`;
    return `- "${f.name}": ${f.label} (${t})`;
  }).join('\n');
}

async function extract(section, doc, filePath, year) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic();
  const data = fs.readFileSync(filePath);
  const content = [];
  if (doc.mime === 'application/pdf') {
    content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: data.toString('base64') } });
  } else if (IMAGE_TYPES.includes(doc.mime)) {
    content.push({ type: 'image', source: { type: 'base64', media_type: doc.mime, data: data.toString('base64') } });
  } else {
    content.push({ type: 'text', text: `File contents:\n${data.toString('utf8').slice(0, 200_000)}` });
  }
  content.push({
    type: 'text',
    text: `You are helping prepare a Sri Lankan individual income tax return for the year of assessment ${year} (1 April to 31 March).
The attached file was uploaded to the section "${section.title}". ${section.help || ''}

Extract every relevant record from the file as rows with exactly these keys:
${fieldSpec(section)}

Rules:
- Only use values visible in the document. Leave a key as "" if it is not shown. Never guess.
- Convert foreign amounts to LKR only if the document itself shows the LKR value.
- For balances "as at 31 March", use the balance on or closest before 31 March of the year of assessment.
- One row per account / certificate / transaction / item.

Reply with JSON only, no prose, in this shape:
{"rows": [ {…}, … ], "notes": "anything the user should double-check"}`,
  });

  const resp = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
    max_tokens: 8000,
    messages: [{ role: 'user', content }],
  });
  const text = resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed.rows)) parsed.rows = [];
  return parsed;
}

module.exports = { enabled, canExtract, extract };

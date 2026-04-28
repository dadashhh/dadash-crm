// CSP Report-Only endpoint — receives violation reports from the browser
// and logs them server-side. Returns 204 No Content as per spec.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }
  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (_) { /* keep raw string */ }
    }
    const report = (body && (body['csp-report'] || body)) || null;
    const violated = report && (report['violated-directive'] || report['violatedDirective']);
    const blocked = report && (report['blocked-uri'] || report['blockedURL']);
    const docUri = report && (report['document-uri'] || report['documentURL']);
    console.error('[CSP]', JSON.stringify({
      violated_directive: violated || null,
      blocked_uri: blocked || null,
      document_uri: docUri || null,
      ua: req.headers['user-agent'] || null
    }));
  } catch (e) {
    console.error('[CSP] report parse error:', e && e.message);
  }
  return res.status(204).end();
}

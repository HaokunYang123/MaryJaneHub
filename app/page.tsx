export default function Home() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>MaryJane Hub - Document Processing</h1>
      <p>Document AI processing and QuickBooks integration API.</p>

      <h2>API Endpoints</h2>
      <ul>
        <li><code>GET /api/documents</code> - List documents</li>
        <li><code>GET /api/documents/[id]</code> - Get document by ID</li>
        <li><code>POST /api/documents/[id]/approve</code> - Approve document</li>
        <li><code>POST /api/documents/[id]/reject</code> - Reject document</li>
        <li><code>POST /api/documents/sync</code> - Sync to QuickBooks</li>
        <li><code>GET /api/documents/summary</code> - Get summary stats</li>
        <li><code>GET /api/quickbooks/connect</code> - Connect QuickBooks</li>
        <li><code>GET /api/cron/process-inbox</code> - Process inbox (cron)</li>
      </ul>

      <h2>Status</h2>
      <p>API is running. Use the endpoints above to interact with the system.</p>
    </main>
  )
}

import http from 'node:http';

const port = Number(process.env.API_PORT || process.env.PORT || 4174);
let sequence = 4;
let tasks = [
  { id: 1, title: 'Review the homepage layout', done: false },
  { id: 2, title: 'Prepare the mobile navigation', done: false },
  { id: 3, title: 'Check the button contrast', done: true },
];
const server = http.createServer(async (request, response) => {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  const pathname = new URL(request.url, 'http://localhost').pathname;
  try {
    if (pathname === '/health') { response.end(JSON.stringify({ status: 'ok', service: 'Mari demo API', synthetic: true })); return; }
    if (pathname === '/tasks' && request.method === 'GET') { response.end(JSON.stringify({ tasks, synthetic: true })); return; }
    let body = '';
    for await (const chunk of request) { body += chunk; if (body.length > 4096) { response.writeHead(413); response.end(JSON.stringify({ error: 'Request too large.' })); return; } }
    const input = body ? JSON.parse(body) : {};
    if (pathname === '/tasks' && request.method === 'POST') {
      const title = String(input.title || '').trim();
      if (!title || title.length > 180) { response.writeHead(400); response.end(JSON.stringify({ error: 'Enter a task title between 1 and 180 characters.' })); return; }
      const task = { id: sequence++, title, done: false }; tasks.push(task); response.writeHead(201); response.end(JSON.stringify(task)); return;
    }
    const match = pathname.match(/^\/tasks\/(\d+)$/);
    if (match) {
      const task = tasks.find((entry) => entry.id === Number(match[1]));
      if (!task) { response.writeHead(404); response.end(JSON.stringify({ error: 'Task not found.' })); return; }
      if (request.method === 'PATCH') { task.done = Boolean(input.done); response.end(JSON.stringify(task)); return; }
      if (request.method === 'DELETE') { tasks = tasks.filter((entry) => entry.id !== task.id); response.writeHead(204); response.end(); return; }
    }
    response.writeHead(404); response.end(JSON.stringify({ error: 'Endpoint not found.' }));
  } catch { response.writeHead(400); response.end(JSON.stringify({ error: 'Invalid request.' })); }
});
server.listen(port, '127.0.0.1', () => console.log(`Mari demo API ready at http://127.0.0.1:${port} (synthetic sample data).`));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));

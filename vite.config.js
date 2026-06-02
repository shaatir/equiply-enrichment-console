import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { enrichRowsWithOpenAi } from './server/openaiEnrichment.js';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  if (env.OPENAI_API_KEY) {
    process.env.OPENAI_API_KEY = env.OPENAI_API_KEY;
  }

  return {
    plugins: [
    react(),
    {
      name: 'equiply-ai-enrichment-api',
      configureServer(server) {
        server.middlewares.use('/api/enrich-ai', async (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Method not allowed' }));
            return;
          }

          try {
            const body = await readJsonBody(req);
            const rows = Array.isArray(body?.rows) ? body.rows : [];
            const model = typeof body?.model === 'string' ? body.model : undefined;
            const enrichedRows = await enrichRowsWithOpenAi(rows, { model });

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ rows: enrichedRows }));
          } catch (error) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: error.message || 'AI enrichment failed.' }));
          }
        });
      }
    }
  ]
  };
});

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk;
    });

    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error('Invalid JSON payload.'));
      }
    });

    req.on('error', reject);
  });
}

import { LiveAdapter } from './liveAdapter';

// Mock localStorage for Node.js
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    key: () => null,
    length: 0
  };
}

async function main() {
  const adapter = new LiveAdapter(
    () => ({ account: '0x1234567890123456789012345678901234567890', chainId: '61997', provider: {} as any }),
    () => '0xA16e22C5890F9C44ab354Eb3F6a22867C2d390A6' // Contract address
  );
  
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (typeof url === 'string' && url.startsWith('/api/')) {
      return originalFetch(`http://localhost:5173${url}`, options);
    }
    return originalFetch(url, options);
  };

  console.log('Loading workspaces scope...');
  let state = await adapter.loadScope('workspaces');
  
  const workspaceId = state.selectedWorkspaceId;
  console.log('Selected workspace:', workspaceId);

  console.log('Loading actions scope...');
  state = await adapter.loadScope('actions', workspaceId);

  const requests = state.requests.filter(r => r.workspaceId === workspaceId);
  console.log(`Observed row count for workspace ${workspaceId}:`, requests.length);
  
  const csvRequest = requests.find(r => r.message.includes('CSV export'));
  if (csvRequest) {
    const evaluation = state.evaluations.find((evaluation) => evaluation.id === csvRequest.evaluationId);
    console.log('CSV request status:', evaluation?.status);
    console.log('CSV request message:', csvRequest.message);
  } else {
    console.log('CSV request not found');
  }
}

main().catch(console.error);

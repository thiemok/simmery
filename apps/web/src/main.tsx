import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-500.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/barlow/latin-700.css';
import '@fontsource/barlow/latin-800.css';
import '@fontsource/oxanium/latin-500.css';
import '@fontsource/oxanium/latin-600.css';
import '@fontsource/oxanium/latin-700.css';
import '@fontsource/share-tech-mono/latin-400.css';
import './styles/tokens.css';
import './styles/global.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createApiClient } from './api/client';
import { createQueryClient } from './api/queries';
import { App } from './App';
import { signInUrl } from './lib/session';
import { createAppRouter } from './router';

const queryClient = createQueryClient(() => {
  const { pathname, search, hash } = window.location;
  window.location.assign(signInUrl(`${pathname}${search}${hash}`));
});

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App api={createApiClient()} queryClient={queryClient} router={createAppRouter()} />
  </StrictMode>,
);

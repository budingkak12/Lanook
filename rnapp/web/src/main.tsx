import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '../../App';

const rootEl = document.getElementById('root');
if (!rootEl) {
  const el = document.createElement('div');
  el.id = 'root';
  document.body.appendChild(el);
}
const container = document.getElementById('root')!;
createRoot(container).render(<App />);


// Service worker mínimo para habilitar a instalação PWA no Android/Chrome.
// Não faz cache agressivo para evitar problemas com atualizações durante o desenvolvimento,
// mas atende aos requisitos do navegador para exibir o botão "Instalar".

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Apenas busca na rede normalmente para satisfazer o requisito PWA sem fazer cache no dev
  event.respondWith(fetch(event.request));
});

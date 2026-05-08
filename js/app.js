/* js/app.js — Initialization entry point */

function init() {
  // Load persisted state
  loadState();

  // Bind all UI events
  initModals();
  initTabs();
  initSliders();
  initCombobox('profile-model', 'profile-model-suggestions');

  // Bind button events
  bindEvents();

  // Initial render
  fullRender();

  // Show settings if no API key configured
  const p = getActiveProfile();
  if (!p.apiKey.trim()) {
    setTimeout(() => {
      renderProfileList();
      loadParamsToForm();
      openModal('settings-overlay');
      document.querySelector('[data-tab="tab-profiles"]').click();
    }, 400);
  }
}

document.addEventListener('DOMContentLoaded', init);

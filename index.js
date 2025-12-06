document.addEventListener('DOMContentLoaded', () => {
  const inputPanel = document.querySelector('data-input-panel');
  const simPanel = document.querySelector('simulation-panel');

  inputPanel.addEventListener('activities-changed', (e) => {
    simPanel.setActivities(e.detail.activities);
  });
});

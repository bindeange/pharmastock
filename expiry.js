// expiry.js - Alertes peremption
const expiryAPI = {
  _db() { return window.db || window.dbAPI; },
  classify(date) {
    if (!date) return null;
    const today = new Date(); today.setHours(0,0,0,0);
    const exp = new Date(date); exp.setHours(0,0,0,0);
    const days = Math.ceil((exp - today) / 86400000);
    if (days < 0) return 'expired';
    if (days < 183) return 'expiry-orange';
    if (days < 365) return 'expiry-yellow';
    return null;
  },
  async checkExpiryAlerts() {
    const d = this._db();
    const lots = await d.getAll('lots');
    const active = lots.filter(l => l.actif !== false);
    return {
      expired: active.filter(l => this.classify(l.date_peremption) === 'expired'),
      soon6: active.filter(l => this.classify(l.date_peremption) === 'expiry-orange'),
      soon12: active.filter(l => this.classify(l.date_peremption) === 'expiry-yellow')
    };
  }
};
window.expiryAPI = expiryAPI;
window.checkExpiryAlerts = () => expiryAPI.checkExpiryAlerts();

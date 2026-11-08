// fefo.js - First Expired First Out
const fefoAPI = {
  _db() { return window.db || window.dbAPI; },
  async byIndex(store, index, value) { const d = this._db(); return d.byIndex ? d.byIndex(store, index, value) : d.getByIndex(store, index, value); },
  async getBestLotForDispensation(medicamentId) {
    const today = new Date().toISOString().slice(0, 10);
    const lots = (await this.byIndex('lots', 'medicament_id', medicamentId).catch(() => []))
      .filter(l => l.actif !== false && l.date_peremption && l.date_peremption >= today);
    const available = [];
    for (const lot of lots) {
      const stock = window.stockAPI ? await stockAPI.calculateLotStock(lot.id) : Number(lot.stock_theorique || 0);
      if (stock > 0) available.push({ ...lot, stock_calcule: stock });
    }
    return available.sort((a, b) => a.date_peremption.localeCompare(b.date_peremption))[0] || null;
  }
};
window.fefoAPI = fefoAPI;
window.getBestLotForDispensation = id => fefoAPI.getBestLotForDispensation(id);

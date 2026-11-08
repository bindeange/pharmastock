// stock.js - Couche mouvements_stock et calcul dynamique du stock par lot
const stockAPI = {
  _db() { return window.db || window.dbAPI; },
  async add(store, data) { const d = this._db(); return d.add(store, data); },
  async get(store, id) { const d = this._db(); return d.get ? d.get(store, id) : d.getById(store, id); },
  async byIndex(store, index, value) { const d = this._db(); return d.byIndex ? d.byIndex(store, index, value) : d.getByIndex(store, index, value); },
  async createMovement(data) {
    return this.add('mouvements_stock', {
      id: data.id,
      medicament_id: data.medicament_id || null,
      lot_id: data.lot_id || null,
      type_mouvement: data.type_mouvement,
      quantite: Number(data.quantite || 0),
      date_mouvement: data.date_mouvement || new Date().toISOString(),
      structure_id: data.structure_id || null,
      depot_id: data.depot_id || null,
      utilisateur: data.utilisateur || 'current_user',
      reference_document: data.reference_document || null,
      ligne_id: data.ligne_id || null,
      observation: data.observation || '',
      synced: false,
      version: 1,
      updated_at: new Date().toISOString()
    });
  },
  async calculateLotStock(lotId) {
    const mouvements = ((await this.byIndex('mouvements_stock', 'lot_id', lotId).catch(() => [])) || [])
      .filter(m => m && m.supprime !== true)
      .sort((a, b) => String(a.date_mouvement).localeCompare(String(b.date_mouvement)));
    if (!mouvements.length) {
      const lot = await this.get('lots', lotId).catch(() => null);
      return Number(lot && lot.stock_theorique || 0);
    }
    return mouvements.reduce((total, m) => {
      const q = Number(m.quantite || 0);
      if (m.type_mouvement === 'entree') return total + q;
      if (m.type_mouvement === 'sortie') return total - q;
      if (m.type_mouvement === 'perte') return total - q;
      if (m.type_mouvement === 'ajustement') return total + q;
      if (m.type_mouvement === 'inventaire') return q;
      return total;
    }, 0);
  }
};
window.stockAPI = stockAPI;
window.calculateLotStock = lotId => stockAPI.calculateLotStock(lotId);

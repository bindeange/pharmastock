// dashboard.js - Statistiques avancees offline
const dashboardAPI = {
  _db() { return window.db || window.dbAPI; },
  async getAdvancedStats() {
    const d = this._db();
    const [lots, meds, mouvements] = await Promise.all([d.getAll('lots'), d.getAll('medicaments'), d.getAll('mouvements_stock').catch(() => [])]);
    const alerts = window.expiryAPI ? await expiryAPI.checkExpiryAlerts() : { expired: [], soon6: [], soon12: [] };
    let valeurStock = 0;
    let valeurPertes = 0;
    const repartition = {};
    for (const lot of lots.filter(l => l.actif !== false)) {
      const med = meds.find(m => m.id === lot.medicament_id);
      const stock = window.stockAPI ? await stockAPI.calculateLotStock(lot.id) : Number(lot.stock_theorique || 0);
      const prix = Number((med && med.prix_achat_unitaire) || lot.prix_achat_unitaire || 0);
      valeurStock += stock * prix;
      const key = (med && med.famille_id) || 'sans_famille';
      repartition[key] = (repartition[key] || 0) + stock;
    }
    for (const m of mouvements.filter(x => x.type_mouvement === 'perte')) {
      const med = meds.find(mm => mm.id === m.medicament_id);
      valeurPertes += Number(m.quantite || 0) * Number((med && med.prix_achat_unitaire) || 0);
    }
    return { lots_expires: alerts.expired.length, lots_proches_expiration: alerts.soon6.length + alerts.soon12.length, valeur_financiere_stock: valeurStock, valeur_financiere_pertes: valeurPertes, repartition_par_famille: repartition };
  }
};
window.dashboardAPI = dashboardAPI;

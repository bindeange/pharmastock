// dispensation.js - Tracabilite des dispensations
const dispensationAPI = {
  _db() { return window.db || window.dbAPI; },
  async createDispensation(data) {
    const d = this._db();
    const id = await d.add('dispensations', {
      patient_reference: data.patient_reference || null,
      medicament_id: data.medicament_id,
      lot_id: data.lot_id,
      quantite: Number(data.quantite || 0),
      date_dispensation: data.date_dispensation || new Date().toISOString(),
      utilisateur: data.utilisateur || 'current_user',
      structure_id: data.structure_id || null,
      synced: false,
      version: 1,
      updated_at: new Date().toISOString()
    });
    if (window.stockAPI) {
      await stockAPI.createMovement({ medicament_id: data.medicament_id, lot_id: data.lot_id, type_mouvement: 'sortie', quantite: data.quantite, reference_document: id, observation: 'Dispensation' });
    }
    return id;
  }
};
window.dispensationAPI = dispensationAPI;

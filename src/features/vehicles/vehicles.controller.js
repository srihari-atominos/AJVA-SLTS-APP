/**
 * vehicles.controller.js
 * Translates HTTP requests into vehicles.service calls.
 */
function makeVehiclesController(service) {
  return {
    async list(req, res) {
      res.json(await service.listForDropdown());
    },

    async upload(req, res) {
      const files = req.files || [];
      if (files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded (field name must be "files")' });
      }
      res.json(await service.importUploadedFiles(files, req.user));
    },

    async remove(req, res) {
      const result = await service.deleteByVehKey(req.params.vehKey, req.user);
      if (!result) return res.status(404).json({ error: 'Vehicle not found' });
      res.json({ ok: true, ...result });
    },
  };
}

module.exports = { makeVehiclesController };

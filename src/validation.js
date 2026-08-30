export function validateRobot(input) {
  const errors = [];
  if (!input || typeof input !== 'object') return ['A JSON robot body is required.'];
  if (typeof input.name !== 'string' || !input.name.trim()) errors.push('name is required.');
  if (typeof input.startUrl !== 'string') errors.push('startUrl is required.');
  else { try { const url = new URL(input.startUrl); if (!['http:', 'https:'].includes(url.protocol)) errors.push('startUrl must use HTTP(S).'); } catch { errors.push('startUrl must be a valid URL.'); } }
  if (!Array.isArray(input.fields) || input.fields.length === 0) errors.push('At least one field is required.');
  else input.fields.forEach((field, index) => {
    if (!field || typeof field.name !== 'string' || !field.name.trim()) errors.push(`fields[${index}].name is required.`);
    if (!field || typeof field.selector !== 'string' || !field.selector.trim()) errors.push(`fields[${index}].selector is required.`);
  });
  if (input.rowSelector !== undefined && input.rowSelector !== null && (typeof input.rowSelector !== 'string' || !input.rowSelector.trim())) errors.push('rowSelector must be a non-empty selector when provided.');
  if (input.maxRows !== undefined && (!Number.isInteger(input.maxRows) || input.maxRows < 1 || input.maxRows > 100)) errors.push('maxRows must be an integer from 1 to 100.');
  return errors;
}

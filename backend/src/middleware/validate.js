'use strict';
const AppError = require('../utils/AppError');

// Validates req.body / req.params / req.query against a zod schema and replaces them with parsed data.
function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      return next(new AppError(400, 'Validation failed', details));
    }
    try {
      req[source] = result.data;
    } catch {
      Object.defineProperty(req, source, { value: result.data, writable: true, configurable: true });
    }
    return next();
  };
}

module.exports = validate;

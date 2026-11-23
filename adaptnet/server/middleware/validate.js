// Checks incoming data against a zod schema.
// Clean data is placed on req.valid. Bad data gets a 400 with clear messages.
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: result.error.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
        })),
      });
    }
    req.valid = result.data;
    next();
  };
}

module.exports = validate;

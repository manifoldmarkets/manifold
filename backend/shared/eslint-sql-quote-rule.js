// Flags a template literal that puts an interpolated value inside SQL quotes,
// e.g. `where id = '${id}'`. Pass the value as a pg-promise parameter instead
// (`where id = $1`, [id]); pg-promise escapes it.
// Two patterns: a quote right before an interpolation in a template that reads
// as SQL, and a quote after `=`, `<>`, `(`, `,` or `like` anywhere.
const message =
  'Interpolated value inside SQL quotes: pass it as a pg-promise parameter instead.'

module.exports = [
  'error',
  {
    selector:
      "TemplateLiteral:has(TemplateElement[value.raw=/\\b(select|update|insert|delete|where|interval|values)\\b/i]) > TemplateElement[tail=false][value.raw=/'%?$/]",
    message,
  },
  {
    selector:
      "TemplateElement[tail=false][value.raw=/(=|<>|\\(|,|like)\\s*'%?$/i]",
    message,
  },
]

export type RelationshipType = 'mono' | 'poly' | 'open' | 'other'

export function convertRelationshipType(relationshipType: RelationshipType) {
  if (relationshipType == 'mono') {
    return 'monogamous'
  }
  if (relationshipType == 'poly') {
    return 'polyamorous'
  }
  return relationshipType
}

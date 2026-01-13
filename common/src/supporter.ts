// Re-export everything from the central config
export {
  type SupporterTier,
  SUPPORTER_TIERS,
  SUPPORTER_ENTITLEMENT_IDS,
  SUPPORTER_BENEFITS,
  getUserSupporterTier,
  getBenefit,
  isSupporter,
  canUpgradeTo,
  getSupporterEntitlement,
  getTierInfo,
  TIER_ORDER,
  BENEFIT_DEFINITIONS,
  getMaxStreakFreezes,
} from './supporter-config'

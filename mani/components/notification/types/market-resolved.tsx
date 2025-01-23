import { ContractResolutionData, Notification } from 'common/notification'
import { floatingEqual } from 'common/util/math'
import { NotificationFrame } from '../notification-frame'

export function MarketResolvedNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup, highlighted, setHighlighted } = props
  const {
    sourceText,
    data,
    sourceId,
    sourceUserName,
    sourceUserUsername,
    sourceContractTitle,
    sourceContractCreatorUsername,
  } = notification
  const { userInvestment, userPayout, profitRank, totalShareholders, token } =
    (data as ContractResolutionData) ?? {}
  const profit = userPayout - userInvestment
  const profitable = profit > 0 && !floatingEqual(userInvestment, 0)
  const betterThan = (totalShareholders ?? 0) - (profitRank ?? 0)
  const comparison =
    profitRank && totalShareholders && betterThan > 0
      ? `you outperformed ${betterThan} other${betterThan > 1 ? 's' : ''}!`
      : ''
  const secondaryTitle =
    sourceText === 'CANCEL' && userInvestment > 0 ? (
      <>
        Your {formatMoney(userInvestment, token)} invested has been returned to
        you
      </>
    ) : sourceText === 'CANCEL' && Math.abs(userPayout) > 0 ? (
      <>Your {formatMoney(-userPayout, token)} in profit has been removed</>
    ) : profitable ? (
      <>
        Your {formatMoney(userInvestment, token)} won{' '}
        <span className="text-teal-600">+{formatMoney(profit, token)}</span> in
        profit
        {comparison ? `, and ${comparison}` : ``} 🎉🎉🎉
      </>
    ) : userInvestment > 0 ? (
      <>
        You lost {formatMoney(Math.abs(profit), token)}
        {comparison ? `, but ${comparison}` : ``}
      </>
    ) : null

  const [openRateModal, setOpenRateModal] = useState(false)

  const resolutionDescription = () => {
    if (!sourceText) return <div />

    if (sourceText === 'YES' || sourceText == 'NO') {
      return <BinaryOutcomeLabel outcome={sourceText as any} />
    }

    if (sourceText.includes('%')) {
      return (
        <ProbPercentLabel
          prob={parseFloat(sourceText.replace('%', '')) / 100}
        />
      )
    }
    if (sourceText === 'MKT' || sourceText === 'PROB') return <MultiLabel />

    // Numeric markets
    const isNumberWithCommaOrPeriod = /^[0-9,.]*$/.test(sourceText)
    if (isNumberWithCommaOrPeriod)
      return <NumericValueLabel value={parseFloat(sourceText)} />

    // Free response market
    return (
      <span
        className={
          'inline-block max-w-[200px] truncate align-bottom text-blue-600'
        }
      >
        {sourceText}
      </span>
    )
  }

  const resolvedByAdmin = sourceUserUsername != sourceContractCreatorUsername

  const showManifoldAsResolver = token === 'CASH'

  const resolverName = showManifoldAsResolver
    ? MANIFOLD_USER_NAME
    : resolvedByAdmin
    ? 'A mod'
    : sourceUserName
  const resolverUsername = showManifoldAsResolver
    ? MANIFOLD_USER_USERNAME
    : sourceUserUsername
  const resolverAvatarUrl = showManifoldAsResolver
    ? MANIFOLD_AVATAR_URL
    : notification.sourceUserAvatarUrl

  const content =
    sourceText === 'CANCEL' ? (
      <>
        <NotificationUserLink
          userId={sourceId}
          name={resolverName}
          username={resolverUsername}
        />{' '}
        cancelled {isChildOfGroup && <span>the question</span>}
        {!isChildOfGroup && (
          <span>
            {' '}
            <PrimaryNotificationLink
              text={sourceContractTitle}
              truncatedLength={'xl'}
            />
          </span>
        )}
      </>
    ) : (
      <>
        <NotificationUserLink
          userId={sourceId}
          name={resolverName}
          username={resolverUsername}
        />{' '}
        resolved {isChildOfGroup && <span>the question</span>}
        {!isChildOfGroup && (
          <span>
            <PrimaryNotificationLink
              text={sourceContractTitle}
              truncatedLength={'xl'}
            />
          </span>
        )}{' '}
        to {resolutionDescription()}
      </>
    )

  const [justNowReview, setJustNowReview] = useState<null | Rating>(null)
  const userReview = useReview(notification.sourceId, notification.userId)
  const showReviewButton = !userReview && !justNowReview

  return (
    <>
      <NotificationFrame
        notification={notification}
        isChildOfGroup={isChildOfGroup}
        highlighted={highlighted}
        setHighlighted={setHighlighted}
        subtitle={
          <>
            {!resolvedByAdmin &&
              (showReviewButton ? (
                <Button
                  size={'2xs'}
                  color={'gray'}
                  onClick={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    setOpenRateModal(true)
                  }}
                >
                  <Row className="gap-1">
                    <StarIcon className="h-4 w-4" />
                    Rate {notification.sourceUserName}'s resolution
                  </Row>
                </Button>
              ) : (
                <Row className="text-ink-500 items-center gap-0.5 text-sm italic">
                  You rated this resolution{' '}
                  {justNowReview ?? userReview?.rating}{' '}
                  <StarIcon className="h-4 w-4" />
                </Row>
              ))}
          </>
        }
        icon={
          <>
            <AvatarNotificationIcon
              notification={{
                ...notification,
                sourceUserAvatarUrl: resolverAvatarUrl,
              }}
              symbol={sourceText === 'CANCEL' ? '🚫' : profitable ? '💰' : '☑️'}
            />
            {!!secondaryTitle && (
              <div
                className={clsx(
                  ' h-full w-[1.5px] grow ',
                  profit < 0 ? 'bg-ink-300' : 'bg-teal-400'
                )}
              />
            )}
          </>
        }
        link={getSourceUrl(notification)}
      >
        {content}
        <Modal open={openRateModal} setOpen={setOpenRateModal}>
          <ReviewPanel
            marketId={notification.sourceId}
            author={notification.sourceUserName}
            className="my-2"
            onSubmit={(rating: Rating) => {
              setJustNowReview(rating)
              setOpenRateModal(false)
            }}
          />
        </Modal>
      </NotificationFrame>
      {!!secondaryTitle && (
        <NotificationFrame
          notification={notification}
          isChildOfGroup={isChildOfGroup}
          highlighted={highlighted}
          setHighlighted={setHighlighted}
          icon={
            <>
              <div
                className={clsx(
                  'absolute -top-4 h-4 w-[1.5px]',
                  profit < 0 ? 'bg-ink-300' : 'bg-teal-400'
                )}
              />

              <NotificationIcon
                symbol={<TokenNumber hideAmount={true} coinType={token} />}
                symbolBackgroundClass={
                  profit < 0
                    ? 'border-ink-300  border-2 ring-4 ring-ink-200'
                    : 'border-teal-400 border-2 ring-4 ring-teal-200'
                }
              />
            </>
          }
          link={getSourceUrl(notification)}
        >
          {secondaryTitle}
        </NotificationFrame>
      )}
    </>
  )
}

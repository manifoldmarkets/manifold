import { Button } from '../buttons/button'
import { Modal } from '../layout/modal'
import { Row } from '../layout/row'
import { Col } from '../layout/col'
import toast from 'react-hot-toast'
import { LogoIcon } from '../icons/logo-icon'
import { DuplicateIcon } from '@heroicons/react/solid'
import { useRef } from 'react'
import { toPng } from 'html-to-image'
import { TokenNumber } from '../widgets/token-number'
import clsx from 'clsx'
import { useNativeInfo } from '../native-message-provider'
import { postMessageToNative } from 'web/lib/native/post-message'
import { LuShare } from 'react-icons/lu'
import { ClipboardCopyIcon } from '@heroicons/react/outline'
import { DisplayUser } from 'common/api/user-types'

type ShareBetCardProps = {
  questionText: string
  outcome: string
  answer?: string
  avgPrice: string
  betAmount: number
  winAmount: number
  resolution?: string
  profit?: number
  bettor: DisplayUser
  isLimitBet?: boolean
  orderAmount?: number
}

// Simple in-memory cache for avatar data URIs
const avatarDataUriCache: { [url: string]: string } = {}

export const ShareBetCard = (props: ShareBetCardProps) => {
  const {
    questionText,
    profit,
    outcome,
    answer,
    avgPrice,
    betAmount,
    winAmount,
    resolution,
    bettor,
    isLimitBet,
    orderAmount,
  } = props
  const won =
    resolution && resolution !== 'CANCEL' ? (profit ?? 0) >= 0 : undefined
  const isSell = betAmount < 0
  const displayAmount = Math.abs(betAmount)
  const displayOrderAmount = orderAmount ? Math.abs(orderAmount) : undefined

  return (
    <div className="w-full min-w-full max-w-xl overflow-hidden rounded-lg bg-gradient-to-br from-indigo-600 via-indigo-600 to-purple-500">
      <div className="flex items-center justify-center pb-4 pt-5">
        <div className="flex items-center gap-2">
          <LogoIcon className="-mt-2 h-14 w-14 text-white" />
          <span className="text-3xl text-white">MANIFOLD</span>
        </div>
      </div>

      <div className="mx-6 mb-3 rounded-lg bg-white p-6">
        <div className={clsx(' flex', answer ? 'mb-4' : 'mb-6')}>
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-gray-800">{questionText}</h2>
          </div>
        </div>

        <Col className="gap-2">
          {answer && (
            <div className="mb-2 line-clamp-2 w-full text-lg font-semibold text-gray-800">
              {answer}
            </div>
          )}
          <Row className="items-center justify-between">
            <Row className="items-center gap-2">
              {/* Avatar component is cached in every copied image, have to use img instead */}
              {bettor.avatarUrl ? (
                <img
                  src={bettor.avatarUrl}
                  alt={`${bettor.name} avatar`}
                  className="h-8 w-8 flex-shrink-0 rounded-full bg-gray-200 object-cover"
                  data-testid="share-avatar"
                />
              ) : (
                <div className="h-8 w-8 flex-shrink-0 rounded-full bg-gray-200"></div>
              )}
              <div className="whitespace-nowrap text-lg text-gray-800">
                {bettor.name}
              </div>
            </Row>
            <div className="whitespace-nowrap text-lg text-gray-500">
              {isLimitBet ? 'Limit order at' : 'Avg'} {avgPrice}
            </div>
          </Row>
        </Col>

        <div className="relative my-6">
          <div className="border-t border-gray-200"></div>
        </div>

        <Col className="flex justify-between">
          <Row className="justify-between">
            {won !== undefined && !won ? (
              <div className="text-gray-500">Profit</div>
            ) : (
              <div className="text-gray-500">
                {isLimitBet ? 'Limit order' : isSell ? 'Sold' : 'Bet'}
              </div>
            )}
            {(won === undefined || won) && (
              <div className="whitespace-nowrap text-gray-500">
                {won !== undefined ? 'Won' : 'To win'}
              </div>
            )}
          </Row>
          <Row className="justify-between gap-2">
            <Row className="gap-2">
              {won !== undefined && !won ? (
                <TokenNumber
                  className="text-2xl font-bold text-red-500"
                  amount={profit}
                />
              ) : (
                <TokenNumber
                  className="text-2xl font-bold text-gray-900"
                  amount={
                    isLimitBet
                      ? displayOrderAmount ?? displayAmount
                      : displayAmount
                  }
                />
              )}
              <div
                className={clsx(
                  'rounded-md px-4 py-2 font-bold',
                  outcome === 'YES'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                )}
              >
                {outcome}
              </div>
            </Row>
            {(won === undefined || won) && (
              <TokenNumber
                className={clsx(
                  'text-2xl font-bold',
                  won ? 'text-teal-500' : 'text-primary-500'
                )}
                amount={Math.abs(winAmount)}
              />
            )}
          </Row>
        </Col>
      </div>

      <div
        className="h-4 w-full bg-white"
        style={{
          maskImage:
            "url(\"data:image/svg+xml,%3Csvg width='100%25' height='100%25' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0,0 C5,0 5,5 10,5 C15,5 15,0 20,0 C25,0 25,5 30,5 C35,5 35,0 40,0 C45,0 45,5 50,5 C55,5 55,0 60,0 C65,0 65,5 70,5 C75,5 75,0 80,0 C85,0 85,5 90,5 C95,5 95,0 100,0 L100,100 L0,100 Z' fill='%23FFFFFF'/%3E%3C/svg%3E\")",
          WebkitMaskImage:
            "url(\"data:image/svg+xml,%3Csvg width='100%25' height='100%25' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0,0 C5,0 5,5 10,5 C15,5 15,0 20,0 C25,0 25,5 30,5 C35,5 35,0 40,0 C45,0 45,5 50,5 C55,5 55,0 60,0 C65,0 65,5 70,5 C75,5 75,0 80,0 C85,0 85,5 90,5 C95,5 95,0 100,0 L100,100 L0,100 Z' fill='%23FFFFFF'/%3E%3C/svg%3E\")",
          maskSize: '20px 100%',
          WebkitMaskSize: '20px 100%',
          maskRepeat: 'repeat-x',
          WebkitMaskRepeat: 'repeat-x',
        }}
      ></div>
    </div>
  )
}

const generateBase64ImageData = async (
  cardRef: React.RefObject<HTMLDivElement>
): Promise<string | null> => {
  if (!cardRef.current) return null

  try {
    // Find the avatar image element using data-testid
    const avatarImg = cardRef.current.querySelector(
      '[data-testid="share-avatar"]'
    ) as HTMLImageElement | null

    if (avatarImg && avatarImg.src && !avatarImg.src.startsWith('data:')) {
      const originalUrl = avatarImg.src

      // Check cache first
      if (avatarDataUriCache[originalUrl]) {
        console.log('Using cached data URI for avatar:', originalUrl)
        avatarImg.src = avatarDataUriCache[originalUrl]
      } else {
        // Only fetch if src is a URL and not in cache
        console.log('Pre-fetching avatar image:', originalUrl)
        try {
          const response = await fetch(originalUrl)
          if (!response.ok) {
            throw new Error(`Failed to fetch avatar: ${response.statusText}`)
          }
          const blob = await response.blob()
          const dataUri = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onloadend = () => resolve(reader.result as string)
            reader.onerror = reject
            reader.readAsDataURL(blob)
          })
          // Embed the fetched image data directly
          console.log('Embedding data URI for avatar')
          avatarImg.src = dataUri
          // Store in cache
          avatarDataUriCache[originalUrl] = dataUri
        } catch (error) {
          console.error('Failed to pre-fetch and embed avatar image:', error)
          // Set src to a transparent placeholder on error
          avatarImg.src =
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
          // Don't cache the error/placeholder
        }
      }
    }
    // Now generate the image
    const dataUrl = await toPng(cardRef.current, {
      quality: 1.0,
      pixelRatio: 2,
      skipFonts: true,
      imagePlaceholder:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      style: {
        transformOrigin: 'center center',
        transform: 'none',
      },
      filter: (node) => {
        return !(node as HTMLElement).classList?.contains('tippy-box')
      },
    })

    // Convert final PNG to blob and back to data URI if needed (or directly use dataUrl)
    const blob = await fetch(dataUrl).then((res) => res.blob())
    if (!blob) {
      toast.error('Failed to create final image blob')
      return null
    }

    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.readAsDataURL(blob)
      reader.onloadend = () => {
        resolve(reader.result as string)
      }
      reader.onerror = () => {
        toast.error('Failed to read final image blob')
        resolve(null)
      }
    })
  } catch (err) {
    console.error('Failed to generate image:', err)
    toast.error('Failed to generate image')
    return null
  }
}

export const ShareBetModal = (
  props: {
    open: boolean
    setOpen: (open: boolean) => void
  } & ShareBetCardProps
) => {
  const { open, setOpen, ...cardProps } = props
  const cardRef = useRef<HTMLDivElement>(null)
  const { isNative, isIOS } = useNativeInfo()

  const generateAndProcessImage = async (
    processFn: (base64data: string) => Promise<void> | void
  ) => {
    const base64data = await generateBase64ImageData(cardRef)
    if (!base64data) return

    try {
      await processFn(base64data)
    } catch (err) {
      console.error('Failed during image processing:', err)
      toast.error('Failed to process image')
    }
  }

  const handleiOSShareOrWebCopy = () => {
    generateAndProcessImage(async (base64data) => {
      if (isNative) {
        postMessageToNative('share', {
          url: base64data,
        })
      } else {
        const blob = await fetch(base64data).then((res) => res.blob())
        if (!blob) {
          toast.error('Failed to create image blob')
          return
        }
        await navigator.clipboard.write([
          new ClipboardItem({
            [blob.type]: blob,
          }),
        ])
        toast.success('Image copied to clipboard!')
      }
    })
  }

  const handleAndroidCopy = () => {
    if (!isNative) return
    generateAndProcessImage((base64data) => {
      postMessageToNative('copyImageToClipboard', {
        imageDataUri: base64data,
      })
      toast.success('Image copied to clipboard!')
    })
  }
  if (!open) return null

  return (
    <Modal
      open={open}
      setOpen={setOpen}
      size="mdlg"
      className="bg-canvas-100 rounded-lg sm:p-4"
    >
      <Col className="items-center">
        <Col className="w-full items-center" ref={cardRef}>
          <ShareBetCard {...cardProps} />
        </Col>
        <Row className=" w-full items-center justify-between gap-2 px-2 py-2 sm:px-0 sm:pb-0 sm:pt-2">
          <Button color="gray-white" onClick={() => setOpen(false)}>
            Close
          </Button>
          <Row className="items-center justify-end gap-2">
            {isNative && !isIOS && (
              <Button color="indigo" onClick={handleAndroidCopy}>
                <Row className="items-center gap-1.5">
                  <ClipboardCopyIcon className="h-5 w-5" aria-hidden />
                  Copy Image
                </Row>
              </Button>
            )}
            {((isNative && isIOS) || !isNative) && (
              <Button color="gradient" onClick={handleiOSShareOrWebCopy}>
                <Row className="items-center gap-1.5">
                  {isIOS ? (
                    <LuShare className="h-5 w-5" aria-hidden />
                  ) : (
                    <DuplicateIcon className="h-5 w-5" aria-hidden />
                  )}
                  {isNative ? 'Share Image' : 'Copy Image'}
                </Row>
              </Button>
            )}
          </Row>
        </Row>
      </Col>
    </Modal>
  )
}

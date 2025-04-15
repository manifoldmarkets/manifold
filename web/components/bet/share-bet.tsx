import { Button } from '../buttons/button'
import { Modal } from '../layout/modal'
import { Row } from '../layout/row'
import { Col } from '../layout/col'
import toast from 'react-hot-toast'
import { LogoIcon } from '../icons/logo-icon'
import { DuplicateIcon, ShareIcon } from '@heroicons/react/solid'
import { useRef } from 'react'
import { toPng } from 'html-to-image'
import { TokenNumber } from '../widgets/token-number'
import clsx from 'clsx'
import { formatPercent } from 'common/util/format'
import { useNativeInfo } from '../native-message-provider'
import { postMessageToNative } from 'web/lib/native/post-message'
import { LuShare } from 'react-icons/lu'

type ShareBetCardProps = {
  questionText: string
  outcome: string
  answer?: string
  avgPrice: string
  betAmount: number
  winAmount: number
  resolution?: string
  profit?: number
  currentPrice?: number
}
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
    currentPrice,
  } = props
  const won =
    resolution && resolution !== 'CANCEL' ? (profit ?? 0) >= 0 : undefined
  return (
    <div className="w-full min-w-full max-w-xl overflow-hidden rounded-lg bg-gradient-to-br from-indigo-600 via-indigo-600 to-purple-500">
      <div className="flex items-center justify-center pb-4 pt-5">
        <div className="flex items-center gap-2">
          <LogoIcon className="-mt-2 h-14 w-14 text-white" />
          <span className="text-3xl text-white">MANIFOLD</span>
        </div>
      </div>

      <div className="mx-6 mb-3 rounded-lg bg-white p-6">
        <div className="mb-6 flex">
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-gray-800">{questionText}</h2>
          </div>
        </div>

        <Row className="items-start justify-between">
          {answer ? (
            <div className="line-clamp-2 w-full text-lg text-gray-800">
              {answer}
            </div>
          ) : !!currentPrice ? (
            <div className="whitespace-nowrap text-lg text-gray-500">
              Now {formatPercent(currentPrice)}
            </div>
          ) : (
            <div />
          )}
          <div className="whitespace-nowrap text-lg text-gray-500">
            Avg {avgPrice}
          </div>
        </Row>

        <div className="relative my-6">
          <div className="border-t border-gray-200"></div>
        </div>

        <Col className="flex justify-between">
          <Row className="justify-between">
            {won !== undefined && !won ? (
              <div className="text-gray-500">Profit</div>
            ) : (
              <div className="text-gray-500">Bet</div>
            )}
            {(won === undefined || won) && (
              <div className="text-gray-500">
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
                  amount={betAmount}
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
                amount={winAmount}
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

export const ShareBetModal = (
  props: {
    open: boolean
    setOpen: (open: boolean) => void
  } & ShareBetCardProps
) => {
  const { open, setOpen, ...cardProps } = props
  const cardRef = useRef<HTMLDivElement>(null)
  const { isNative, isIOS } = useNativeInfo()

  const handleCopyShareImage = async () => {
    if (!cardRef.current) return

    try {
      const dataUrl = await toPng(cardRef.current, {
        quality: 1.0,
        pixelRatio: 2,
        skipFonts: true,
        style: {
          // Ensure all styles are inlined
          transformOrigin: 'center center',
          transform: 'none',
        },
        filter: (node) => {
          // Skip problematic elements that might cause CORS issues
          return !(node as HTMLElement).classList?.contains('tippy-box')
        },
      })

      // Create a temporary image element
      const img = new Image()
      img.crossOrigin = 'anonymous'

      // Wait for image to load before proceeding
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
        img.src = dataUrl
      })

      // Create a canvas to draw the image
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        toast.error('Failed to create image context')
        return
      }

      // Draw the image on the canvas
      ctx.drawImage(img, 0, 0)

      // Convert to blob and copy to clipboard
      canvas.toBlob(async (blob) => {
        if (!blob) {
          toast.error('Failed to create image blob')
          return
        }
        try {
          if (isNative) {
            // Convert blob to base64 for sharing
            const reader = new FileReader()
            reader.readAsDataURL(blob)
            reader.onloadend = () => {
              const base64data = reader.result as string
              // Use share with url property for the image data
              postMessageToNative('share', {
                url: base64data,
              })
            }
          } else {
            await navigator.clipboard.write([
              new ClipboardItem({
                [blob.type]: blob,
              }),
            ])
            toast.success('Image copied to clipboard!')
          }
        } catch (err) {
          console.error('Failed to copy image:', err)
          toast.error('Failed to copy image to clipboard')
        }
      }, 'image/png')
    } catch (err) {
      console.error('Failed to generate image:', err)
      toast.error('Failed to generate image')
    }
  }

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
          <Button color="gradient" onClick={handleCopyShareImage}>
            <Row className="items-center gap-1.5">
              {isIOS ? (
                <LuShare className="h-5 w-5" aria-hidden />
              ) : isNative ? (
                <ShareIcon className="h-5 w-5" aria-hidden />
              ) : (
                <DuplicateIcon className="h-5 w-5" aria-hidden />
              )}
              {isNative ? 'Share Image' : 'Copy Image'}
            </Row>
          </Button>
        </Row>
      </Col>
    </Modal>
  )
}

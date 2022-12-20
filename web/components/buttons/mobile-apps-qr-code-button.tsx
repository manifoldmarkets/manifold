import { Button } from 'web/components/buttons/button'
import React, { useState } from 'react'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { QRCode } from 'web/components/widgets/qr-code'
import { APPLE_APP_URL, GOOGLE_PLAY_APP_URL } from 'common/envs/constants'
import { Tabs } from 'web/components/layout/tabs'

export const MobileAppsQRCodeButton = () => {
  const [isModalOpen, setIsModalOpen] = useState(false)

  return (
    <>
      <Button color={'indigo'} onClick={() => setIsModalOpen(true)}>
        Get the app
      </Button>

      <Modal open={isModalOpen} setOpen={setIsModalOpen}>
        <Col className={'rounded-2xl bg-white p-4'}>
          <span className={'py-2 text-2xl text-indigo-700'}>
            Get the Manifold app
          </span>
          <span className={'py-2 '}>
            Scan this QR code to download the app now
          </span>
          <Tabs
            tabs={[
              {
                title: 'Apple',
                content: (
                  <Col className={'w-full items-center justify-center p-4'}>
                    <QRCode url={APPLE_APP_URL} />
                  </Col>
                ),
              },
              {
                title: 'Android',
                content: (
                  <Col className={'w-full items-center justify-center p-4'}>
                    <QRCode url={GOOGLE_PLAY_APP_URL} />
                  </Col>
                ),
              },
            ]}
          />
        </Col>
      </Modal>
    </>
  )
}

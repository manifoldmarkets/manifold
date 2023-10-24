import { useState } from 'react'
import { useLovers } from 'love/hooks/use-lovers'
import { Col } from 'web/components/layout/col'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { LovePage } from 'love/components/love-page'
import { Filters } from 'love/components/filters'
import { PhotosModal } from 'love/components/photos-modal'
import { Title } from 'web/components/widgets/title'
import { Lover } from 'love/hooks/use-lover'
import { ProfilePreview } from './ProfilePreview'

export default function ProfilesPage() {
  const allLovers = useLovers()
  const [lovers, setLovers] = useState<Lover[] | undefined>(undefined)
  const [showPhotosModal, setShowPhotosModal] = useState(false)
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>()

  return (
    <LovePage trackPageView={'user profiles'}>
      <Col className="items-center">
        <Col className={'bg-canvas-0 w-full rounded px-6 py-4'}>
          <Title className="!mb-2 text-3xl">Profiles</Title>
          <Filters allLovers={allLovers} setLovers={setLovers} />

          {lovers === undefined ? (
            <LoadingIndicator />
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {lovers.map((lover) => (
                <ProfilePreview
                  key={lover.id}
                  lover={lover}
                  setSelectedPhotos={setSelectedPhotos}
                  setShowPhotosModal={setShowPhotosModal}
                />
              ))}
            </div>
          )}
        </Col>
        <PhotosModal
          photos={selectedPhotos ?? []}
          open={showPhotosModal}
          setOpen={setShowPhotosModal}
        />
      </Col>
    </LovePage>
  )
}

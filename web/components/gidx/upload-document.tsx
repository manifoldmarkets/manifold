import { useUser } from 'web/hooks/use-user'
import { useState } from 'react'
import { Row } from 'web/components/layout/row'
import { Button, buttonClass } from 'web/components/buttons/button'
import { z } from 'zod'
import { APIError } from 'common/api/utils'
import { FileUploadButton } from 'web/components/buttons/file-upload-button'
import { Col } from 'web/components/layout/col'
import { api } from 'web/lib/firebase/api'
import { uploadPrivateImage } from 'web/lib/firebase/storage'
import { last } from 'lodash'
import { Select } from 'web/components/widgets/select'
import clsx from 'clsx'
import { idNameToCategoryType } from 'common/gidx/gidx'

export const UploadDocuments = (props: {
  back: () => void
  next: () => void
}) => {
  const { back, next } = props
  const user = useUser()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [CategoryType, setCategoryType] = useState(2)

  const uploadDocument = async () => {
    if (!user) return
    if (!file) {
      setError('Please select a file.')
      return
    }

    const FileTypeSchema = z.union([
      z.literal('application/pdf'),
      z.literal('image/jpeg'),
      z.literal('image/png'),
      z.literal('image/webp'),
    ])

    const validationResult = FileTypeSchema.safeParse(file.type)
    if (!validationResult.success) {
      setError('Invalid file type. Only PDF, JPEG, WEBP, and PNG are allowed.')
      return
    }
    const ext = last(file.name.split('.'))
    const fileName = 'id-document.' + ext
    const fileUrl = await uploadPrivateImage(user.id, file, fileName)
    setLoading(true)
    setError(null)
    const response = await api('upload-document-gidx', {
      fileUrl,
      fileName,
      CategoryType: 2,
    })
      .catch((e) => {
        if (e instanceof APIError) {
          setError(e.message)
        }
        return null
      })
      .finally(() => {
        setLoading(false)
      })
    console.log(response)
    if (response) next()
  }

  return (
    <Col className={'gap-3 p-4'}>
      <span className={'text-primary-700 text-2xl'}>Identity Verification</span>
      {error && <span className={'text-red-500'}>{error}</span>}

      <Col className={'gap-3'}>
        <span className={''}>Document type</span>
        <Select
          className={''}
          value={CategoryType}
          onChange={(e) => setCategoryType(Number(e.target.value))}
        >
          {Object.entries(idNameToCategoryType).map(([type, number]) => (
            <option key={number + type} value={number}>
              {type}
            </option>
          ))}
        </Select>
        <span className={''}>Document to upload</span>
        {file && (
          <img
            alt={'Document'}
            src={file ? URL.createObjectURL(file) : ''}
            width={500}
            height={500}
            className="bg-ink-400 flex items-center justify-center"
          />
        )}
        {file ? <span>{file.name}</span> : null}
        <Row>
          <FileUploadButton
            accept={['.pdf', '.jpg', '.jpeg', '.png', '.webp']}
            onFiles={(files) => setFile(files[0])}
            className={clsx(
              !file
                ? buttonClass('md', 'indigo')
                : buttonClass('md', 'indigo-outline')
            )}
          >
            Select a {file ? 'different ' : ''}file
          </FileUploadButton>
        </Row>
      </Col>
      <Row className={'mb-4 mt-4 w-full gap-16'}>
        <Button color={'gray-white'} disabled={loading} onClick={back}>
          Back
        </Button>
        <Button
          loading={loading}
          disabled={loading || !file}
          onClick={uploadDocument}
        >
          Submit
        </Button>
      </Row>
    </Col>
  )
}

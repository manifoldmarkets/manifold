import { useUser } from 'web/hooks/use-user'
import { useEffect, useState } from 'react'
import { Row } from 'web/components/layout/row'
import { Button, buttonClass } from 'web/components/buttons/button'
import { z } from 'zod'
import { APIError } from 'common/api/utils'
import { FileUploadButton } from 'web/components/buttons/file-upload-button'
import { Col } from 'web/components/layout/col'
import { api } from 'web/lib/api/api'
import { uploadPrivateImage } from 'web/lib/firebase/storage'
import { last } from 'lodash'
import { Select } from 'web/components/widgets/select'
import clsx from 'clsx'
import { GIDXDocument, idNameToCategoryType } from 'common/gidx/gidx'
import { BottomRow } from './register-component-helpers'

export const UploadDocuments = (props: {
  back: () => void
  next: () => void
  requireUtilityDoc: boolean
}) => {
  const { back, next, requireUtilityDoc } = props
  const user = useUser()
  const [docs, setDocs] = useState<{
    documents: GIDXDocument[]
    utilityDocuments: GIDXDocument[]
    rejectedDocuments: GIDXDocument[]
    idDocuments: GIDXDocument[]
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [CategoryType, setCategoryType] = useState(2)
  const [currentStep, setCurrentStep] = useState<'id' | 'utility'>('id')

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
    const fileName = `id-document-${
      getKeyFromValue(idNameToCategoryType, CategoryType) ?? ''
    }.${ext}`

    setLoading(true)
    setError(null)
    const fileUrl = await uploadPrivateImage(user.id, file, fileName)
    const { status } = await api('upload-document-gidx', {
      fileUrl,
      fileName,
      CategoryType,
    }).catch((e) => {
      console.error(e)
      if (e instanceof APIError) {
        setError(e.message)
      }
      return { status: 'error' }
    })
    if (status !== 'success') {
      setLoading(false)
      return
    }
    await getAndSetDocuments()
  }

  const getAndSetDocuments = async () => {
    setLoading(true)
    const { documents, utilityDocuments, rejectedDocuments, idDocuments } =
      await api('get-verification-documents-gidx', {})
        .catch((e) => {
          console.error(e)
          if (e instanceof APIError) {
            setError(e.message)
          }
          return {
            documents: null,
            utilityDocuments: null,
            idDocuments: null,
            rejectedDocuments: null,
          }
        })
        .finally(() => setLoading(false))
    if (!documents) return
    setDocs({
      documents,
      rejectedDocuments,
      utilityDocuments,
      idDocuments,
    })
    setFile(null)
    if (currentStep === 'id' && idDocuments.length > 0) {
      if (requireUtilityDoc && utilityDocuments.length === 0) {
        setCategoryType(7)
        setCurrentStep('utility')
      } else {
        next()
      }
    } else if (currentStep === 'utility' && utilityDocuments.length > 0) {
      next()
    }
  }

  useEffect(() => {
    getAndSetDocuments()
  }, [])

  const hasRejectedUtilityDoc = (docs?.rejectedDocuments ?? []).some(
    (doc) => doc.CategoryType === 7 || doc.CategoryType === 1
  )
  const hasRejectedIdDoc = (docs?.rejectedDocuments ?? []).some(
    (doc) => doc.CategoryType !== 7 && doc.CategoryType !== 1
  )
  const documentsToAccept = Object.entries(idNameToCategoryType).filter(
    ([_, value]) =>
      currentStep === 'id'
        ? value !== 7 && value !== 1
        : value === 7 || value === 1
  )

  return (
    <Col className={''}>
      <Col className={'gap-3'}>
        <span className={'font-semibold'}>
          Please upload one of the following:
        </span>
        <Select
          className={''}
          value={CategoryType}
          onChange={(e) => setCategoryType(Number(e.target.value))}
        >
          {documentsToAccept.map(([type, number]) => (
            <option key={type} value={number}>
              {type}
            </option>
          ))}
        </Select>
        {file && file.type.startsWith('image/') && (
          <img
            alt={'Document'}
            src={URL.createObjectURL(file)}
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
                : buttonClass('md', 'gray-outline')
            )}
          >
            Select a {file ? 'different ' : ''}{' '}
            {getKeyFromValue(idNameToCategoryType, CategoryType)} file
          </FileUploadButton>
        </Row>
      </Col>
      <BottomRow className="mt-4">
        <Button color={'gray-white'} disabled={loading} onClick={back}>
          Back
        </Button>
        <Button
          loading={loading}
          disabled={loading || !file}
          onClick={uploadDocument}
        >
          Submit {getKeyFromValue(idNameToCategoryType, CategoryType)}
        </Button>
      </BottomRow>
      <Col className={'py-2'}>
        {currentStep === 'id' && hasRejectedIdDoc ? (
          <span className={' text-red-500'}>
            Your previous id document was rejected, please try again.
          </span>
        ) : (
          currentStep === 'utility' &&
          hasRejectedUtilityDoc && (
            <span className={' text-red-500'}>
              Your previous utility document was rejected, please try again.
            </span>
          )
        )}
        {error && <span className={'text-red-500'}>{error}</span>}
      </Col>
    </Col>
  )
}

const getKeyFromValue = (obj: Record<string, number>, value: number) =>
  Object.keys(obj).find((key) => obj[key] === value)

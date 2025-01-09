import { useEffect, useState } from 'react'
import { View, StyleSheet, Image, Platform, Pressable } from 'react-native'
import { Text } from 'components/text'
import { Button } from 'components/buttons/button'
import { Colors } from 'constants/colors'
import { GIDXDocument, idNameToCategoryType } from 'common/gidx/gidx'
import { api } from 'lib/api'
import * as ImagePicker from 'expo-image-picker'
import { uploadPrivateImage } from 'lib/firebase/storage'
import { useUser } from 'hooks/use-user'

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
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [CategoryType, setCategoryType] = useState(2)
  const [currentStep, setCurrentStep] = useState<'id' | 'utility'>('id')
  const [showDropdown, setShowDropdown] = useState(false)

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      setError('Sorry, we need camera roll permissions to make this work!')
      return
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
        exif: false,
        base64: false,
        selectionLimit: 1,
      })

      if (!result.canceled) {
        setSelectedImage(result.assets[0].uri)
        setError(null)
      }
    } catch (e) {
      console.error('Error picking image:', e)
      setError('Failed to select image. Please try again.')
    }
  }

  const uploadDocument = async () => {
    if (!user) return
    if (!selectedImage) {
      setError('Please select an image.')
      return
    }

    const getFileExtension = (uri: string) => {
      const match = /\.(\w+)$/.exec(uri)
      return match ? match[1].toLowerCase() : 'jpg'
    }

    setLoading(true)
    setError(null)

    try {
      const extension = getFileExtension(selectedImage)
      const fileName = `id-document-${Date.now()}-${
        getKeyFromValue(idNameToCategoryType, CategoryType) ?? ''
      }.${extension}`

      const fileUrl = await uploadPrivateImage(user.id, selectedImage, fileName)

      const { status } = await api('upload-document-gidx', {
        fileUrl,
        fileName,
        CategoryType,
      })

      if (status === 'success') {
        await getAndSetDocuments()
      } else {
        throw new Error('Failed to upload document')
      }
    } catch (e: any) {
      console.error('Error uploading document:', e)
      setError(e.message || 'Failed to upload document. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const getAndSetDocuments = async () => {
    setLoading(true)
    try {
      const { documents, utilityDocuments, rejectedDocuments, idDocuments } =
        await api('get-verification-documents-gidx', {})

      setDocs({
        documents,
        rejectedDocuments,
        utilityDocuments,
        idDocuments,
      })
      setSelectedImage(null)

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
    } catch (e: any) {
      console.error(e)
      setError(e.message)
    } finally {
      setLoading(false)
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

  const documentOptions = Object.entries(idNameToCategoryType).filter(
    ([_, value]) =>
      currentStep === 'id'
        ? value !== 7 && value !== 1
        : value === 7 || value === 1
  )

  const selectedDocumentName =
    getKeyFromValue(idNameToCategoryType, CategoryType) ??
    'Select document type'

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Please upload one of the following:</Text>

      <View style={styles.dropdownContainer}>
        <Pressable
          style={styles.dropdownButton}
          onPress={() => setShowDropdown(!showDropdown)}
        >
          <Text style={styles.dropdownButtonText}>{selectedDocumentName}</Text>
        </Pressable>

        {showDropdown && (
          <View style={styles.dropdownList}>
            {documentOptions.map(([name, value]) => (
              <Pressable
                key={name}
                style={styles.dropdownItem}
                onPress={() => {
                  setCategoryType(value)
                  setShowDropdown(false)
                }}
              >
                <Text
                  style={[
                    styles.dropdownItemText,
                    value === CategoryType && styles.dropdownItemTextSelected,
                  ]}
                >
                  {name}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {selectedImage && (
        <Image source={{ uri: selectedImage }} style={styles.preview} />
      )}

      <View style={styles.buttonRow}>
        <Button
          onPress={pickImage}
          title={selectedImage ? 'Choose different image' : 'Select image'}
          variant={selectedImage ? 'gray' : 'primary'}
        />
      </View>

      <View style={styles.buttonRow}>
        <Button onPress={back} title="Back" variant="gray" disabled={loading} />
        <Button
          onPress={uploadDocument}
          title="Submit"
          loading={loading}
          disabled={loading || !selectedImage}
        />
      </View>

      {currentStep === 'id' && hasRejectedIdDoc && (
        <Text style={styles.errorText}>
          Your previous id document was rejected, please try again.
        </Text>
      )}
      {currentStep === 'utility' && hasRejectedUtilityDoc && (
        <Text style={styles.errorText}>
          Your previous utility document was rejected, please try again.
        </Text>
      )}
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  )
}

const getKeyFromValue = (obj: Record<string, number>, value: number) =>
  Object.keys(obj).find((key) => obj[key] === value)

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  dropdownContainer: {
    position: 'relative',
    zIndex: 1,
    marginBottom: 16,
  },
  dropdownButton: {
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dropdownButtonText: {
    fontSize: 16,
    color: Colors.text,
  },
  dropdownList: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 8,
    marginTop: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
      },
      android: {
        elevation: 5,
      },
    }),
  },
  dropdownItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  dropdownItemText: {
    fontSize: 16,
    color: Colors.text,
  },
  dropdownItemTextSelected: {
    color: Colors.blue,
    fontWeight: 'bold',
  },
  preview: {
    width: '100%',
    height: 300,
    resizeMode: 'contain',
    marginBottom: 16,
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  errorText: {
    color: Colors.error,
    marginTop: 8,
    textAlign: 'center',
  },
})

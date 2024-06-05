import React, { useState, useRef } from 'react'
import { uploadAudio } from 'web/lib/firebase/storage'
import { Button } from 'web/components/buttons/button'
import { SelectUsers } from 'web/components/select-users'
import { Col } from 'web/components/layout/col'
import { DisplayUser } from 'common/api/user-types'

const SoundRecorder: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number>(0)
  const [isUploading, setIsUploading] = useState(false)
  const [user, setUser] = useState<DisplayUser>()
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  const startRecording = async () => {
    if (!user) {
      alert('Please select a user to record for')
      return
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mediaRecorder = new MediaRecorder(stream)
    mediaRecorderRef.current = mediaRecorder
    audioChunksRef.current = []

    mediaRecorder.ondataavailable = (event) => {
      audioChunksRef.current.push(event.data)
    }

    mediaRecorder.onstop = async () => {
      const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
      const url = URL.createObjectURL(blob)
      setAudioUrl(url)
      const file = new File([blob], user.id + '.webm', {
        type: 'audio/webm',
      })
      try {
        const downloadURL = await uploadAudio(
          file,
          'soundtrack',
          (progress, isRunning) => {
            setIsUploading(isRunning)
            setUploadProgress(progress)
          }
        )
        console.log('Uploaded file available at', downloadURL)
      } catch (error) {
        console.error('Upload failed:', error)
      }
    }

    mediaRecorder.start()
    setIsRecording(true)
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  return (
    <Col className="gap-4">
      <SelectUsers
        className={'w-64'}
        maxUsers={1}
        setSelectedUsers={(users) => setUser(users[0])}
        selectedUsers={user ? [user] : []}
        ignoreUserIds={[]}
      />
      <Button
        onClick={isRecording ? stopRecording : startRecording}
        loading={isUploading && uploadProgress > 0}
      >
        {isRecording ? 'Stop Recording' : 'Start Recording'}
      </Button>
      {audioUrl && (
        <div className="mt-4">
          <audio controls src={audioUrl} />
        </div>
      )}
    </Col>
  )
}

export default SoundRecorder

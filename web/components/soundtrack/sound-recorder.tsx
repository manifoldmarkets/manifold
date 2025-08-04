import React, { useState, useRef, useEffect } from 'react'
import { uploadAudio } from 'web/lib/firebase/storage'
import { Button } from 'web/components/buttons/button'
import { SelectUsers } from 'web/components/select-users'
import { Col } from 'web/components/layout/col'
import { DisplayUser } from 'common/api/user-types'
import useUserSounds from 'web/hooks/use-soundtracks'
import { Dictionary } from 'lodash'

export const soundsByUserId: Dictionary<string> = {}

const SoundRecorder: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<number>(1)
  const [user, setUser] = useState<DisplayUser>()
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const { sounds, loadSounds } = useUserSounds()

  useEffect(() => {
    sounds.forEach((s) => (soundsByUserId[soundUrlToUserId(s)] = s))
  }, [JSON.stringify(sounds)])

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
      const file = new File([blob], user.id + '.webm', {
        type: 'audio/webm',
      })
      try {
        const downloadURL = await uploadAudio(
          file,
          'soundtrack',
          (progress) => {
            console.log('uploading', progress)
            setUploadProgress(progress)
          }
        )
        console.log('Uploaded file available at', downloadURL)
        loadSounds()
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
        className={'w-40'}
        onClick={isRecording ? stopRecording : startRecording}
        loading={uploadProgress != 1}
      >
        {isRecording ? 'Stop recording' : 'Record your prayer'}
      </Button>
    </Col>
  )
}

export default SoundRecorder

export const soundUrlToUserId = (s: string) =>
  s.split('soundtrack%2F')[1].split('.webm')[0]

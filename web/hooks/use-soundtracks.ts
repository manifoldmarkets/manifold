import { useEffect } from 'react'
import { ref, listAll, getDownloadURL } from 'firebase/storage'
import { storage } from 'web/lib/firebase/init'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'

const useUserSounds = () => {
  const [sounds, setSounds] = usePersistentInMemoryState<string[]>(
    [],
    'user-soundtrack-sounds'
  )
  const loadSounds = async () => {
    try {
      const soundsRef = ref(storage, 'user-audios/soundtrack')
      const result = await listAll(soundsRef)
      const urls = await Promise.all(
        result.items
          .filter((i) => !sounds.includes(i.fullPath))
          .map((itemRef) => getDownloadURL(itemRef))
      )
      setSounds(urls)
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    loadSounds()
  }, [])

  return { sounds, loadSounds }
}

export default useUserSounds

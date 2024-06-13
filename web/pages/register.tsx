import { Registration } from 'web/components/gidx/register'
import { useState } from 'react'

const HomePage = () => {
  const [open, setOpen] = useState(true)

  return (
    <div className="container mx-auto">
      <Registration open={open} setOpen={setOpen} />
    </div>
  )
}

export default HomePage

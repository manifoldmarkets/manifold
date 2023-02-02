// async ({ query }) =>
//   sortBy(await searchUsers(query, 6), (u) =>
//     [u.name, u.username].some((s) => beginsWith(s, query)) ? -1 : 0
//   )

import clsx from 'clsx'
import { Group } from 'common/group'
import { Col } from '../layout/col'
import { Modal, MODAL_CLASS, SCROLLABLE_MODAL_CLASS } from '../layout/modal'
import { Input } from '../widgets/input'

// export function GroupAddMemberModal(props: {
//   group: Group,
//   open: boolean,
//   setOpen: (open:boolean)=>void

// }) {
//   const { group, open, setOpen } = props

//   return (
//     <Modal open={open} setOpen={setOpen}>
//       <Col className={clsx(MODAL_CLASS, SCROLLABLE_MODAL_CLASS)}>
//         <Input
//           type="text"
//           inputMode="search"
//           value={query}
//           onChange={(e) => updateQuery(e.target.value)}
//           onBlur={trackCallback('search', { query: query })}
//           placeholder="Search"
//           className="w-full"
//           autoFocus={autoFocus}
//         />
//       </Col>
//     </Modal>
//   )
// }

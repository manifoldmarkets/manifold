import { RequestHandler } from 'express-serve-static-core'
import { addOrRemoveGroupFromContract } from './update-tag'

export const removecontractfromgroup: RequestHandler = (req, res, next) => {
  req.body.remove = true
  addOrRemoveGroupFromContract(req, res, next)
}

import * as jwt from 'jsonwebtoken';
import {Inject} from "di-typescript";
import {User} from "../user/models/User";
import {Party} from "../user/models/Party";
import {UnauthorizedError} from "./UnauthorizedError";
import {AuthUser} from "./AuthUser";
import {config} from '../config';
import {addMs} from '../utils/date';

@Inject
export class AuthenticationService {

  async authenticate(nameOrEmail: string, codeOrPassword: string): Promise<AuthUser> {
    // TODO: Unterscheidung bauen
    const user = await this.authenticateByNameAndCode(nameOrEmail, codeOrPassword);
    return this.convertUserToAuthUser(user);
  }

  createJWToken(user: AuthUser): string {
    const {secret, issuer, expiresIn} = config.auth.jwt;
    return jwt.sign({user}, secret, {issuer, expiresIn});
  }

  getUserFromJWTPayload(payload: { user: AuthUser }): AuthUser {
    return payload.user;
  }

  private async authenticateByNameAndCode(name: string, code: string): Promise<User> {
    if (name && code) {
      const user = await User.unscoped().findOne({
        include: [{
          model: Party.unscoped(),
        }],
        where: {name}
      });

      if (user && !user.isLocked()) {
        if (user.party.code === code) {
          return user;
        } else {
          await this.processFailedAttempts(user);
        }
      }
    }
    throw new UnauthorizedError();
  }

  private convertUserToAuthUser({id, partyId, name, scopes}: User): AuthUser {
    return {id, partyId, name, scopes};
  }

  private async processFailedAttempts(user: User) {
    // add one more failed attempt
    user.failedAuthAttempts = (user.failedAuthAttempts || 0) + 1;
    // if failed attempt is equal to or greater than max attempts
    if (user.failedAuthAttempts >= config.auth.maxFailedAttempts) {
      // lock account
      user.lockedUntil = addMs(new Date(), config.auth.lockingTime);
      user.failedAuthAttempts = 0;
    }
    await user.save();
  }

}
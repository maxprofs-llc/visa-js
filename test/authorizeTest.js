const { describe, describe: context, it } = require('mocha');
const visa = require('../');
const should = require('chai').should();
const express = require('express');
const request = require('supertest');
const passport = require('passport')
const Strategy = require('passport-strategy').Strategy;

describe('visa.js authorize', () => {
  context('express app is running and passport local strategy is used', () => {
    let app = null;
    let server = null;

    class TestStrategy extends Strategy {
      authenticate(req, options) {
        this.success({ id: 999, role: 'teller' });
      }
    }
    passport.use('test', new TestStrategy());

    beforeEach(() => {
      visa.reset();
      app = express();
      app.use(passport.initialize());
      server = app.listen(3001);
    });

    afterEach(() => {
      server.close();
    });

    context('user role is matching', () => {
      it('should be authorized', () => {
        visa.policy({
          objects: {
            'account': {
              operations: {
                'open': (subject, _, context) => subject.role === 'teller'
                  && context.ip === '::ffff:127.0.0.1'
              }
            },
          }
        });
        app.post(
          '/api/account',
          passport.authenticate('test', { session: false }),
          visa.authorize(visa.user.can.open.account),
          (req, res) => res.send()
        );
        return request(app)
          .post('/api/account')
          .expect(200);
      });
    });
    context('user is the owner of specific object', () => {
      it('should be authorized', () => {
        visa.policy({
          objects: {
            'account': {
              mapRefsToObjects: refs => refs.map(ref => ({ ownerId: 999 })),
              operations: {
                'close': (subject, account) => account.ownerId === subject.id,
              }
            },
          }
        });
        app.delete(
          '/api/account/:id',
          passport.authenticate('test', { session: false }),
          visa.authorize(visa.user.can.close.account),
          (req, res) => res.send()
        );
        return request(app)
          .delete('/api/account/1')
          .expect(200);
      });
    });
    context('user role is not matching', () => {
      it('should NOT be authorized and return 401', () => {
        visa.policy({
          objects: {
            'account': {
              operations: {
                'open': (subject) => subject.role === 'manager',
              }
            },
          }
        });
        app.post(
          '/api/account',
          passport.authenticate('test', { session: false }),
          visa.authorize(visa.user.can.open.account),
          (req, res) => res.send()
        );
        return request(app)
          .post('/api/account')
          .expect(401);
      });
    });
    context('visa rule fails', () => {
      it('should NOT be authorized and return 500', () => {
        visa.policy({
          objects: {
            'account': {
              operations: {
                'open': (subject) => { throw new Error('test error') },
              }
            },
          }
        });
        app.post(
          '/api/account',
          passport.authenticate('test', { session: false }),
          visa.authorize(visa.user.can.open.account),
          (req, res) => res.send()
        );
        return request(app)
          .post('/api/account')
          .expect(500);
      });
    });
  });
});
const bcrypt = require('bcrypt');

module.exports = class Login {

  constructor(expressApp) {
    this.app = expressApp;
    this.get();
    this.post();
    this.delete();
  }

  // Check if logged in
  get() {
    this.app.get('/rest/login', (req, res) => {

      // Session does not exist. User is not logged in.
      if (!req.session.user) {
        res.json({ user: false, status: 'Not logged in' });
        return;
      }

      // Session exists. User is logged in.
      res.json({ user: req.session.user, status: 'Logged in' });
    });
  }

  // Log out
  delete() {
    this.app.delete('/rest/login', (req, res) => {

      // If a user session exists: terminate it
      if (req.session.user) {
        res.json({ user: false, status: 'Logging out' });

        // Log the user out by deleting the session
        delete req.session.user;
      }

      else if (!req.session.user) {
        res.json({ user: false, status: 'Can\'t log out if not logged in.' });
      }
    });
  }

  // Log in
  post() {
    this.app.post('/rest/login', async (req, res) => {

      // Session exists. Already logged in.
      if (req.session.user) {
        res.json({ user: req.session.user, status: 'Already logged in.' });
        return;
      }

      // Attempt to log in
      let email = req.body.email;
      let password = req.body.password;

      // Map existing emails - used later so email can't be duplicated
      let userFromDb = await global.dbQuery('SELECT * FROM users WHERE email = ?',
        [email]
      );
      
      if (userFromDb.length) {
        userFromDb = userFromDb[0];

        if (await bcrypt.compare(password, userFromDb.password)) {
          let user = Object.assign({}, userFromDb);
          delete user.password;

          if (user.role === 'banned') {
            res.json({ user: false, status: 'Account has been banished.' });
            user = false;
          }

          else {
            res.json({ user: user, status: 'Successfully logged in' });
          }

          req.session.user = user;

          return;
        }
      }
      
      res.json({ user: false, status: 'Incorrect credentials' });
    });
  }

}
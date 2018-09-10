const pm = require('promisemaker'),
  mysql = require('mysql'),
  bcrypt = require('bcrypt'),
  userRights = require('../user-rights.json');

module.exports = class Rest {
  // Call this method to initialize middleware.
  static start(settings) {
    Rest.settings = settings;
    Rest.connectToSql();
    return (...args) => new Rest(...args);
  }

  static connectToSql() {
    // Promisify MySQL and create a connection named db
    Rest.db = pm(mysql.createConnection(Rest.settings.dbCredentials), {
      rejectOnErrors: Rest.settings.runtimeErrors,
      mapArgsToProps: {
        query: ['rows', 'fields']
      }
    });
  }

  // Create one instance per request
  constructor(req, res, next) {
    // Save as properties
    this.req = req;
    this.res = res;
    this.next = next;

    // An alias for settings. Connected to 'this'.
    this.settings = Rest.settings;

    // Make sure the base url ends with '/'
    if (this.settings.baseUrl.substr(-1) != '/') {
      this.settings.baseUrl += '/';
    }

    if (this.analyzeUrl()) {
      // Return if url was not '/rest'
      return;
    }

    if (!this.checkUserRights()) {
      this.res.sendStatus(403);
      this.res.json({ Error: 'Not allowed' });
      return;
    }

    // Call the correct method
    if (['get', 'post', 'put', 'delete'].includes(this.method)) {
      this[this.method]();
    }
  }

  analyzeUrl() {
    let url = this.req.url;
    let method = this.req.method.toLowerCase();
    let baseUrl = this.settings.baseUrl;

    if (url.indexOf(baseUrl) != 0) {
      this.next();
      return;
    }

    // Remove baseUrl and split rest of url on '/'
    let urlParts = url.split(baseUrl, 2)[1].split('/');

    // Set properties after analysis
    this.table = urlParts[0].split(';').join('');
    this.id = urlParts[1];
    this.method = method;
    this.idColName = this.settings.idMap[this.table] || 'id';
    this.urlQuery = this.req.query;
  }

  checkUserRights() {
    let ok = false;
    let role = this.req.session.user && this.req.session.user.role;

    if (!role) {
      role = 'visitor';
    }

    let rights = userRights[role];

    if (rights[this.table]) {
      let okMethods = rights[this.table];

      if (okMethods.constructor !== Array) {
        okMethods = [okMethods];
      }

      for (let okMethod of okMethods) {
        if (okMethod == this.method) {
          ok = true;
        }
      }
    }

    return ok;
  }

  async get() {
    // Do a query with or without id to the correct table
    // let result = await this.query(
    //   'SELECT * FROM `' + this.table + '`' +
    //   (this.id ? ' WHERE ' + this.idColName + ' = ?' : ''),
    //   [this.id]
    // );

    let queryString = 'SELECT * FROM ' + this.table;
    let params = [];
    let limitparams = [];

    if (this.id) {
      queryString += ' WHERE ' + this.idColName + ' = ?';
      params.push(this.id);
    } else {
      queryString += '[wherecondition]';
    }

    if (this.urlQuery.order_by) {
      queryString += ' ORDER BY `' + this.urlQuery.order_by + '`';
    }

    if (this.urlQuery.desc == 1) {
      queryString += ' DESC';
    }

    if (this.urlQuery.limit) {
      queryString += ' LIMIT ?';
      limitparams.push(this.urlQuery.limit / 1);
    }

    if (this.urlQuery.offset) {
      queryString += ' OFFSET ?';
      limitparams.push(this.urlQuery.offset / 1);
    }

    delete this.urlQuery.order_by;
    delete this.urlQuery.desc;
    delete this.urlQuery.limit;
    delete this.urlQuery.offset;

    let where = '';

    for (let columnName in this.urlQuery) {
      let columnVal = decodeURIComponent(this.urlQuery[columnName]);

      columnVal = columnVal.split('*').join('%');

      if (where != '') {
        where += ' && ';
      }

      where += '`' + columnName + '` LIKE ?';

      params.push(isNaN(columnVal / 1) ? columnVal : columnVal / 1);
    }

    if (where != '') {
      queryString = queryString
        .split('[wherecondition]')
        .join(' WHERE ' + where + ' ');
    } else {
      queryString = queryString.split('[wherecondition]').join('');
    }

    params = params.concat(limitparams);

    let result = await this.query(queryString, params);

    // Error from MySQL
    if (result.constructor === Error) {
      this.res.sendStatus(500);
    } else if (this.id && result.length === 0) {
      this.res.sendStatus(500);
      this.res.json({ Error: 'No post' });
      return;
    }

    // Convert id query from array to object
    else if (this.id) {
      result = result[0];
    }

    this.res.json(result);
  }

  async delete() {
    let result = await this.query(
      'DELETE FROM `' + this.table + '` WHERE `' + this.idColName + '` = ?',
      [this.id]
    );

    if (result.constructor === Error) {
      this.res.sendStatus(500);
    }

    this.res.json(result);
  }

  async post() {
    if (this.table == 'users') {
      if (await this.checkDuplicateUser()) {
        return;
      }
    }

    await this.set();
  }

  async put() {
    await this.set();
  }

  async set() {
    let queryString =
      (this.id ? 'UPDATE ' : 'INSERT INTO ') + '`' + this.table + '` SET ? ';

    // Check if the table is 'users'
    // then hash 'req.body.password'
    if (this.table == 'users' && this.req.body.password) {
      let hash = await bcrypt.hash(this.req.body.password, 12);
      this.req.body.password = hash;
      console.log(this.req.body.password);
    }

    // Run query with or without 'id'.
    let result = await this.query(
      queryString + (this.id ? ' WHERE `' + this.idColName + '` = ?' : ''),
      [this.req.body, this.id]
    );

    if (result.constructor === Error) {
      this.res.sendStatus(500);

      result = {
        status: result.sqlMessage
      };
    }

    if (this.table == 'users' && this.id == this.req.session.user.id) {
      let userFromDb = await this.query('SELECT * FROM users WHERE id = ?', [
        this.id
      ]);

      userFromDb = userFromDb[0];
      delete userFromDb.password;

      this.req.session.user = userFromDb;

      result = {
        user: userFromDb,
        result: result
      };
    }

    this.res.json(result);
  }

  async checkDuplicateUser() {
    let s = await this.query('SELECT email FROM users WHERE email = ?', [
      this.req.body.email
    ]);

    if (s.length) {
      this.res.json({
        user: false,
        Error: 'Email already exists'
      });
    }

    return s.length;
  }

  async query(query, params) {
    let result = await Rest.db.query(query, params);
    return result.rows;
  }

  static async query(query, params) {
    let result = await Rest.db.query(query, params);
    return result.rows;
  }
};

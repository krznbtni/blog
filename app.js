const express = require('express'),
  app = express(),
  cors = require('cors'),
  compression = require('compression'),
  helmet = require('helmet'),
  bodyParser = require('body-parser'),
  cookieParser = require('cookie-parser'),
  morgan = require('morgan'),
  Rest = require('./classes/rest.class'),
  Login = require('./classes/login.class'),
  Search = require('./classes/search.class'),
  CookieSession = require('./classes/cookie-session.class');

process.on('unhandledRejection', error =>
  console.log('unhandledRejection', error)
);

// Environment variables
require('dotenv').config();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(compression());
app.use(helmet());
app.use(morgan('dev')); // Logger.
app.use(bodyParser.json()); // Reads a form's input and stores it as a JavaScript object accessible through req.body.
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(new CookieSession().middleware());

// Not middleware
new Login(app);
new Search(app);

app.use(
  Rest.start({
    dbCredentials: {
      host: process.env.DB_HOST || '127.0.0.1',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'blog',
      multipleStatements: true
    },
    baseUrl: '/api',
    idMap: {
      posts_categories: 'post_id',
      posts_comments: 'post_id',
      users_comments: 'user_id'
    },
    runtimeErrors: false
  })
);

global.dbQuery = Rest.query;

app.listen(port, () => console.log(`Server listening on port ${port}.`));

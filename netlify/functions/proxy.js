const serverless = require("serverless-http");
const app = require("../../proxy/index");

const handler = serverless(app, {
  basePath: "/.netlify/functions/proxy",
  binary: false,
});

exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  return handler(event, context);
};

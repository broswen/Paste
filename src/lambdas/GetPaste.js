'use strict';
const middy = require('@middy/core');

const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { DynamoDBClient, PutItemCommand, GetItemCommand } = require('@aws-sdk/client-dynamodb');
const { KSUID } = require('ksuid');

const s3Client = new S3Client();
const ddbClient = new DynamoDBClient();

const jsonBodyParser = require('@middy/http-json-body-parser');
const httpErrorHandler = require('@middy/http-error-handler');
const validator = require('@middy/validator');
const createError = require('http-errors');

const inputSchema = {
  type: 'object',
  properties: {
    pathParameters: {
      type: 'object',
      properties: {
        id: { type: 'string' }
      },
      required: ['id']
    },
    queryStringParameters: {
      type: 'object',
      properties: {
        pass: { type: 'string' }
      }
    }
  }
}

const getPaste = async (event) => {

  let pass = (event.queryStringParameters && event.queryStringParameters.pass) || ''

  const params = {
    TableName: process.env.TABLE,
    Key: {
      PK: {
        S: event.pathParameters.id
      }
    }
  }

  let data;
  try {
    data = await ddbClient.send(new GetItemCommand(params));
  } catch (error) {
    console.error(error);
    throw createError(500, 'error retrieving paste');
  }

  if (data.Item === undefined) throw createError(404);

  //if item has password
  if (data.Item.password.S !== '') {
    //if no password provided
    if (pass === '') throw createError(401)
    //if password is wrong
    if (pass !== data.Item.password.S) throw createError(403)
  }

  const params2 = {
    Bucket: process.env.BUCKET,
    Key: event.pathParameters.id,
  }

  const streamToString = (stream) =>
    new Promise((resolve, reject) => {
      const chunks = [];
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("error", reject);
      stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });

  let file;
  try {
    file = await s3Client.send(new GetObjectCommand(params2));
  } catch (error) {
    console.error(error);
    throw createError(500, 'error retrieving paste');
  }

  const contents = await streamToString(file.Body);

  return {
    statusCode: 200,
    body: JSON.stringify(
      {
        id: event.pathParameters.id,
        data: contents
      }
    )
  };
};

const handler = middy(getPaste)
  .use(jsonBodyParser())
  .use(validator({ inputSchema }))
  .use(httpErrorHandler());

module.exports = { handler };

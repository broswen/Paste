'use strict';
const middy = require('@middy/core');

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const KSUID = require('ksuid');

const s3Client = new S3Client();
const ddbClient = new DynamoDBClient();

const jsonBodyParser = require('@middy/http-json-body-parser');
const httpErrorHandler = require('@middy/http-error-handler');
const validator = require('@middy/validator');
const createError = require('http-errors');

const inputSchema = {
  type: 'object',
  properties: {
    body: {
      type: 'object',
      properties: {
        data: { type: 'string', maxLength: 1000000 },
        pass: { type: 'string', minLength: 1, maxLength: 256 }
      },
      required: ['data']
    }
  }
}

const expiration = 60 * 60 * 24; //1 day

const uploadPaste = async (event) => {

  const id = await KSUID.random();

  const params = {
    TableName: process.env.TABLE,
    Item: {
      PK: {
        S: id.string
      },
      TTL: {
        N: `${(new Date().getTime() / 1000) + expiration}`
      },
      password: {
        S: event.body.pass || ''
      }
    }
  }

  try {
    await ddbClient.send(new PutItemCommand(params));
  } catch (error) {
    console.error(error);
    throw createError(500, 'error saving paste');
  }

  const params2 = {
    Bucket: process.env.BUCKET,
    Key: id.string,
    Body: Buffer.from(event.body.data)
  }

  try {
    await s3Client.send(new PutObjectCommand(params2));
  } catch (error) {
    console.error(error);
    throw createError(500, 'error saving paste');
  }

  return {
    statusCode: 200,
    body: JSON.stringify(
      {
        id: id.string
      }
    )
  };
};

const handler = middy(uploadPaste)
  .use(jsonBodyParser())
  .use(validator({ inputSchema }))
  .use(httpErrorHandler());

module.exports = { handler };

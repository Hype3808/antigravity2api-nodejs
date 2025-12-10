/**
 * Google OAuth 凭证
 * 统一管理，避免在多个文件中重复定义
 */
export const OAUTH_CONFIG = {
  CLIENT_ID: '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com',
  CLIENT_SECRET: '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',
  TOKEN_URL: 'https://oauth2.googleapis.com/token',
  SCOPES: [
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/cclog',
    'https://www.googleapis.com/auth/experimentsandconfigs'
  ]
};

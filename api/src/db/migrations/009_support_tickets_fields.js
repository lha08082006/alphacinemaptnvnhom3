'use strict';

/**
 * MIGRATION 009 - Bổ sung các trường thông tin sự cố cho support_tickets
 */
exports.up = async (knex) => {
  const hasIssueType = await knex.schema.hasColumn('support_tickets', 'issue_type');
  if (!hasIssueType) {
    await knex.schema.alterTable('support_tickets', (t) => {
      t.string('issue_type').nullable();
      t.text('description').nullable();
      t.text('attachment_url').nullable();
    });
  }
};

exports.down = async (knex) => {
  await knex.schema.alterTable('support_tickets', (t) => {
    t.dropColumn('attachment_url');
    t.dropColumn('description');
    t.dropColumn('issue_type');
  });
};

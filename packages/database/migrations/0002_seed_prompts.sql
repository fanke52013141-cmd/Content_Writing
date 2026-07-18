WITH local_user AS (
  SELECT id FROM local_users LIMIT 1
), seed(capability_key, name, body) AS (
  VALUES
    (
      'account.positioning',
      '账号定位示例',
      '根据用户提供的领域、目标读者、价值主张和表达偏好，生成一份可编辑的账号定位候选。明确说明推断项，不虚构用户经历。'
    ),
    (
      'topic.hot-filter',
      '热点筛选示例',
      '结合当前账号定位逐项判断热点的相关性、时效性、风险和可持续创作角度。只推荐真正适合账号的热点。'
    ),
    (
      'research.plan',
      '研究计划示例',
      '为当前选题生成研究问题、搜索关键词、所需证据类型和停止条件。区分事实核查与观点素材。'
    ),
    (
      'material.process',
      '素材处理示例',
      '整理输入素材的摘要、可验证事实、观点、案例和引用。保留来源，未知信息标记为待核实。'
    ),
    (
      'outline.write',
      '文章框架示例',
      '根据账号定位、选题和素材生成公众号文章框架。每一部分说明写作目标、关键论点和证据需求。'
    ),
    (
      'article.write',
      '正文写作示例',
      '根据已确认的框架和素材生成文章候选版本。保持账号表达一致，不编造事实，并在需要引用处保留来源标记。'
    ),
    (
      'review.positioning',
      '定位与表达评审示例',
      '评审文章与账号定位、目标读者和表达风格的一致性。给出问题位置、理由和可执行修改建议。'
    ),
    (
      'review.fact-risk',
      '事实引用风险评审示例',
      '检查事实、数字、引用、版权和合规风险。区分已证实、待核实和高风险内容，不替用户隐瞒不确定性。'
    ),
    (
      'review.readability',
      '可读性传播力评审示例',
      '检查公众号阅读节奏、标题吸引力、段落长度、信息密度和转发价值，给出不过度夸张的传播优化建议。'
    ),
    (
      'article.revise',
      '定向改写示例',
      '只根据用户选中的评审意见生成新的候选版本。保留未要求修改的内容，并列出本次改动摘要。'
    )
), inserted_prompts AS (
  INSERT INTO prompts (owner_user_id, capability_key, name)
  SELECT local_user.id, seed.capability_key, seed.name
  FROM seed CROSS JOIN local_user
  RETURNING id, capability_key
)
INSERT INTO prompt_versions (
  prompt_id, version_number, status, is_default, body, activated_at
)
SELECT inserted_prompts.id, 1, 'active', true, seed.body, now()
FROM inserted_prompts
JOIN seed USING (capability_key);

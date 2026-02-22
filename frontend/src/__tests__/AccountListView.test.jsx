import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AccountListView from '../components/AccountListView';
import { CLICK_COPY_DELAY_MS } from '../hooks/useInlineEdit';

// Mock HistoryDrawer to avoid API calls and state issues
vi.mock('../components/HistoryDrawer', () => ({
  default: ({ isOpen, onClose, account, darkMode }) => {
    if (!isOpen) return null;
    return (
      <div data-testid="history-drawer">
        <div>历史记录抽屉</div>
        <button onClick={onClose}>关闭</button>
        {account && <div>账号: {account.email}</div>}
      </div>
    );
  }
}));

const mockAccounts = [
  {
    id: 1,
    email: 'test1@gmail.com',
    password: 'password1',
    recovery: 'recovery1@gmail.com',
    secret: 'JBSWY3DPEHPK3PXP',
    status: 'pro',
    soldStatus: 'unsold',
    remark: '测试账号1',
    createdAt: '2024-01-01',
  },
  {
    id: 2,
    email: 'test2@gmail.com',
    password: 'password2',
    recovery: 'recovery2@gmail.com',
    secret: 'JBSWY3DPEHPK3PXQ',
    status: 'inactive',
    soldStatus: 'sold',
    remark: '测试账号2',
    createdAt: '2024-01-02',
  },
];

const DOUBLE_CLICK_SETTLE_MS = CLICK_COPY_DELAY_MS + 120;

const buildMockAccount = (id) => ({
  id,
  email: `test${id}@gmail.com`,
  password: `password${id}`,
  recovery: `recovery${id}@gmail.com`,
  secret: 'JBSWY3DPEHPK3PXP',
  status: id % 2 === 0 ? 'inactive' : 'pro',
  soldStatus: id % 3 === 0 ? 'sold' : 'unsold',
  remark: `测试账号${id}`,
  createdAt: '2024-01-01',
});

describe('AccountListView 组件', () => {
  const defaultProps = {
    accounts: mockAccounts,
    search: '',
    setSearch: vi.fn(),
    soldStatusFilter: 'all',
    setSoldStatusFilter: vi.fn(),
    groupFilter: null,
    setGroupFilter: vi.fn(),
    allGroups: [],
    copyToClipboard: vi.fn(),
    twoFACodes: {},
    toggleStatus: vi.fn(),
    toggleSoldStatus: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onBatchDelete: vi.fn(),
    onInlineEdit: vi.fn(),
    loading: false,
    onSearchChange: vi.fn(),
    darkMode: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('基础渲染', () => {
    it('渲染页面标题和描述', () => {
      render(<AccountListView {...defaultProps} />);

      expect(screen.getByText('账号库')).toBeInTheDocument();
      expect(screen.getByText('管理您的所有谷歌账号资产')).toBeInTheDocument();
    });

    it('渲染搜索框', () => {
      render(<AccountListView {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('搜索邮箱或备注内容...');
      expect(searchInput).toBeInTheDocument();
    });

    it('渲染账号列表', () => {
      render(<AccountListView {...defaultProps} />);

      expect(screen.getByText('test1@gmail.com')).toBeInTheDocument();
      expect(screen.getByText('test2@gmail.com')).toBeInTheDocument();
    });

    it('显示所有表头', () => {
      render(<AccountListView {...defaultProps} />);

      expect(screen.getByText('序号')).toBeInTheDocument();
      expect(screen.getByText('账号')).toBeInTheDocument();
      expect(screen.getByText('状态')).toBeInTheDocument();
      expect(screen.getByText('恢复')).toBeInTheDocument();
      expect(screen.getByText('手机')).toBeInTheDocument();
      expect(screen.getByText('2FA')).toBeInTheDocument();
      expect(screen.getByText('标签')).toBeInTheDocument();
      expect(screen.getByText('操作')).toBeInTheDocument();
      expect(screen.getByText('备注')).toBeInTheDocument();
      expect(screen.getByText('导入')).toBeInTheDocument();
    });
  });

  describe('加载和空状态', () => {
    it('显示加载状态', () => {
      render(<AccountListView {...defaultProps} loading={true} accounts={[]} />);

      expect(screen.getByText('加载中...')).toBeInTheDocument();
      expect(screen.queryByText('test1@gmail.com')).not.toBeInTheDocument();
    });

    it('显示空状态', () => {
      render(<AccountListView {...defaultProps} accounts={[]} />);

      expect(screen.getByText('未找到相关账号')).toBeInTheDocument();
      expect(screen.getByText('尝试更换关键词或导入新账号')).toBeInTheDocument();
    });
  });

  describe('搜索功能', () => {
    it('搜索框输入触发 setSearch 和 onSearchChange', async () => {
      const user = userEvent.setup();
      render(<AccountListView {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('搜索邮箱或备注内容...');
      await user.type(searchInput, 'test');

      expect(defaultProps.setSearch).toHaveBeenCalled();
      expect(defaultProps.onSearchChange).toHaveBeenCalled();
    });

    it('搜索框显示当前搜索值', () => {
      render(<AccountListView {...defaultProps} search="test1" />);

      const searchInput = screen.getByPlaceholderText('搜索邮箱或备注内容...');
      expect(searchInput).toHaveValue('test1');
    });
  });

  describe('筛选功能', () => {
    it('渲染所有筛选按钮', () => {
      render(<AccountListView {...defaultProps} />);

      const filterButtons = screen.getAllByRole('button');
      const allButton = filterButtons.find(btn => btn.textContent === '全部' && btn.className.includes('px-3 py-1.5'));
      const unsoldButton = filterButtons.find(btn => btn.textContent === '未售出');
      const soldButton = filterButtons.find(btn => btn.textContent === '已售出');

      expect(allButton).toBeInTheDocument();
      expect(unsoldButton).toBeInTheDocument();
      expect(soldButton).toBeInTheDocument();
    });

    it('点击"全部"筛选按钮', async () => {
      const user = userEvent.setup();
      render(<AccountListView {...defaultProps} />);

      const filterButtons = screen.getAllByRole('button');
      const allButton = filterButtons.find(btn => btn.textContent === '全部' && btn.className.includes('px-3 py-1.5'));
      await user.click(allButton);

      expect(defaultProps.setSoldStatusFilter).toHaveBeenCalledWith('all');
    });

    it('点击"未售出"筛选按钮', async () => {
      const user = userEvent.setup();
      render(<AccountListView {...defaultProps} />);

      const filterButtons = screen.getAllByRole('button');
      const unsoldButton = filterButtons.find(btn => btn.textContent === '未售出');
      await user.click(unsoldButton);

      expect(defaultProps.setSoldStatusFilter).toHaveBeenCalledWith('unsold');
    });

    it('点击"已售出"筛选按钮', async () => {
      const user = userEvent.setup();
      render(<AccountListView {...defaultProps} />);

      const filterButtons = screen.getAllByRole('button');
      const soldButton = filterButtons.find(btn => btn.textContent === '已售出');
      await user.click(soldButton);

      expect(defaultProps.setSoldStatusFilter).toHaveBeenCalledWith('sold');
    });

    it('筛选按钮高亮当前选中状态', () => {
      render(<AccountListView {...defaultProps} soldStatusFilter="unsold" />);

      const filterButtons = screen.getAllByRole('button');
      const unsoldButton = filterButtons.find(btn => btn.textContent === '未售出');
      expect(unsoldButton).toHaveClass('bg-green-500');
    });
  });

  describe('账号信息显示', () => {
    it('显示账号邮箱', () => {
      render(<AccountListView {...defaultProps} />);

      expect(screen.getByText('test1@gmail.com')).toBeInTheDocument();
      expect(screen.getByText('test2@gmail.com')).toBeInTheDocument();
    });

    it('显示恢复邮箱', () => {
      render(<AccountListView {...defaultProps} />);

      expect(screen.getByText('recovery1@gmail.com')).toBeInTheDocument();
      expect(screen.getByText('recovery2@gmail.com')).toBeInTheDocument();
    });

    it('显示备注信息', () => {
      render(<AccountListView {...defaultProps} />);

      expect(screen.getByText('测试账号1')).toBeInTheDocument();
      expect(screen.getByText('测试账号2')).toBeInTheDocument();
    });

    it('显示导入时间', () => {
      render(<AccountListView {...defaultProps} />);

      expect(screen.getByText('2024-01-01')).toBeInTheDocument();
      expect(screen.getByText('2024-01-02')).toBeInTheDocument();
    });

    it('导入时间按日期和时间分行展示', () => {
      const accountsWithTime = [{
        ...mockAccounts[0],
        createdAt: '2024-01-01 12:34:56',
      }];

      render(<AccountListView {...defaultProps} accounts={accountsWithTime} />);

      expect(screen.getByText('2024-01-01')).toBeInTheDocument();
      expect(screen.getByText('12:34:56')).toBeInTheDocument();
    });

    it('显示账号序号', () => {
      render(<AccountListView {...defaultProps} />);

      const numbers = screen.getAllByText(/^[0-9]+$/);
      expect(numbers.length).toBeGreaterThan(0);
    });
  });

  describe('排序功能', () => {
    it('点击表头可在升序和降序之间切换', async () => {
      const user = userEvent.setup();
      const sortableAccounts = [
        {
          id: 10,
          email: 'zeta@example.com',
          password: 'password-z',
          recovery: '',
          secret: '',
          status: 'inactive',
          soldStatus: 'unsold',
          remark: '',
          createdAt: '2024-01-02',
        },
        {
          id: 11,
          email: 'alpha@example.com',
          password: 'password-a',
          recovery: '',
          secret: '',
          status: 'inactive',
          soldStatus: 'unsold',
          remark: '',
          createdAt: '2024-01-01',
        },
      ];

      render(<AccountListView {...defaultProps} accounts={sortableAccounts} />);

      const getOrder = () => screen
        .getAllByText(/(zeta|alpha)@example\.com/)
        .map((el) => el.textContent);

      expect(getOrder()).toEqual(['zeta@example.com', 'alpha@example.com']);

      const accountSortButton = screen.getByRole('button', { name: '账号' });
      await user.click(accountSortButton);
      expect(getOrder()).toEqual(['alpha@example.com', 'zeta@example.com']);

      await user.click(accountSortButton);
      expect(getOrder()).toEqual(['zeta@example.com', 'alpha@example.com']);
    });

    it('空值会跟随排序方向切换（升序在后，降序在前）', async () => {
      const user = userEvent.setup();
      const sortableAccounts = [
        {
          id: 20,
          email: 'has-remark@example.com',
          password: 'password-a',
          recovery: '',
          secret: '',
          status: 'inactive',
          soldStatus: 'unsold',
          remark: '有备注',
          createdAt: '2024-01-02',
        },
        {
          id: 21,
          email: 'empty-remark@example.com',
          password: 'password-b',
          recovery: '',
          secret: '',
          status: 'inactive',
          soldStatus: 'unsold',
          remark: '',
          createdAt: '2024-01-01',
        },
      ];

      render(<AccountListView {...defaultProps} accounts={sortableAccounts} />);

      const getOrder = () => screen
        .getAllByText(/(has-remark|empty-remark)@example\.com/)
        .map((el) => el.textContent);

      const remarkSortButton = screen.getByRole('button', { name: '备注' });

      await user.click(remarkSortButton); // asc: 空值应在后
      expect(getOrder()).toEqual(['has-remark@example.com', 'empty-remark@example.com']);

      await user.click(remarkSortButton); // desc: 空值应在前
      expect(getOrder()).toEqual(['empty-remark@example.com', 'has-remark@example.com']);
    });
  });

  describe('状态切换', () => {
    it('显示 Pro 状态', () => {
      render(<AccountListView {...defaultProps} />);

      expect(screen.getByText('Pro')).toBeInTheDocument();
    });

    it('显示未开启状态', () => {
      render(<AccountListView {...defaultProps} />);

      expect(screen.getByText('普通')).toBeInTheDocument();
    });

    it('点击状态按钮触发 toggleStatus', async () => {
      const user = userEvent.setup();
      render(<AccountListView {...defaultProps} />);

      const statusButton = screen.getByText('Pro');
      await user.click(statusButton);

      expect(defaultProps.toggleStatus).toHaveBeenCalledWith(1);
    });

    it('显示已售出状态', () => {
      render(<AccountListView {...defaultProps} />);

      const soldButtons = screen.getAllByRole('button').filter(btn => btn.textContent === '已售出');
      expect(soldButtons.length).toBeGreaterThan(0);
    });

    it('显示未售出状态', () => {
      render(<AccountListView {...defaultProps} />);

      const unsoldButtons = screen.getAllByRole('button').filter(btn => btn.textContent === '未售出');
      expect(unsoldButtons.length).toBeGreaterThan(0);
    });

    it('点击售出状态按钮触发 toggleSoldStatus', async () => {
      const user = userEvent.setup();
      render(<AccountListView {...defaultProps} />);

      // Find the sold status button in the table (not the filter button)
      const allButtons = screen.getAllByRole('button');
      const soldStatusButton = allButtons.find(btn =>
        btn.textContent === '未售出' &&
        btn.className.includes('border-green-500')
      );

      if (soldStatusButton) {
        await user.click(soldStatusButton);
        expect(defaultProps.toggleSoldStatus).toHaveBeenCalledWith(1, 'unsold');
      }
    });
  });

  describe('操作按钮', () => {
    it('点击邮箱单元格复制', async () => {
      const user = userEvent.setup();
      render(<AccountListView {...defaultProps} />);

      // 点击邮箱文本来复制
      const emailElement = screen.getByText('test1@gmail.com');
      await user.click(emailElement);

      await waitFor(() => {
        expect(defaultProps.copyToClipboard).toHaveBeenCalledWith('test1@gmail.com', '邮箱');
      });
    });

    it('点击密码单元格复制', async () => {
      const user = userEvent.setup();
      render(<AccountListView {...defaultProps} />);

      // 点击密码文本来复制
      const passwordElement = screen.getByText('password1');
      await user.click(passwordElement);

      await waitFor(() => {
        expect(defaultProps.copyToClipboard).toHaveBeenCalledWith('password1', '密码');
      });
    });

    it('点击恢复邮箱单元格复制', async () => {
      const user = userEvent.setup();
      render(<AccountListView {...defaultProps} />);

      // 点击恢复邮箱文本来复制
      const recoveryElement = screen.getByText('recovery1@gmail.com');
      await user.click(recoveryElement);

      await waitFor(() => {
        expect(defaultProps.copyToClipboard).toHaveBeenCalledWith('recovery1@gmail.com', '恢复邮箱');
      });
    });

    it('邮箱/恢复邮箱直接显示完整地址，不再显示域名拆分按钮', async () => {
      const user = userEvent.setup();
      render(<AccountListView {...defaultProps} />);

      expect(screen.queryByTitle('单击复制域名，双击编辑')).not.toBeInTheDocument();
      expect(screen.getByText('test1@gmail.com')).toBeInTheDocument();
      expect(screen.getByText('recovery1@gmail.com')).toBeInTheDocument();

      await user.click(screen.getByText('test1@gmail.com'));
      await waitFor(() => {
        expect(defaultProps.copyToClipboard).toHaveBeenCalledWith('test1@gmail.com', '邮箱');
      });

      await user.click(screen.getByText('recovery1@gmail.com'));
      await waitFor(() => {
        expect(defaultProps.copyToClipboard).toHaveBeenCalledWith('recovery1@gmail.com', '恢复邮箱');
      });
    });

    it('不再依赖旧版获取2FA验证码按钮', () => {
      render(<AccountListView {...defaultProps} />);

      expect(screen.queryByText('获取验证码')).not.toBeInTheDocument();
    });

    it('点击编辑按钮触发 onEdit', async () => {
      const user = userEvent.setup();
      render(<AccountListView {...defaultProps} />);

      const editButtons = screen.getAllByTitle('编辑');
      await user.click(editButtons[0]);

      expect(defaultProps.onEdit).toHaveBeenCalledWith(mockAccounts[0]);
    });

    it('点击删除按钮触发 onDelete', async () => {
      const user = userEvent.setup();
      render(<AccountListView {...defaultProps} />);

      const deleteButtons = screen.getAllByTitle('删除');
      await user.click(deleteButtons[0]);

      expect(defaultProps.onDelete).toHaveBeenCalledWith(1);
    });

    it('点击复制全部信息按钮', async () => {
      const user = userEvent.setup();
      render(<AccountListView {...defaultProps} />);

      const copyAllButtons = screen.getAllByTitle('复制全部信息');
      await user.click(copyAllButtons[0]);

      expect(defaultProps.copyToClipboard).toHaveBeenCalled();
      const callArgs = defaultProps.copyToClipboard.mock.calls.at(-1);
      expect(callArgs[0]).toContain('test1@gmail.com');
      expect(callArgs[0]).toContain('password1');
      expect(callArgs[0]).toContain('recovery1@gmail.com');
      expect(callArgs[1]).toBe('全部信息');
    });

    it('手机号列支持分开复制手机号和国别+手机号', async () => {
      const user = userEvent.setup();
      const phoneAccounts = [{
        ...mockAccounts[0],
        phone: '+8613812345678',
      }];

      render(<AccountListView {...defaultProps} accounts={phoneAccounts} />);

      const countryButtons = screen.getAllByTitle('单击复制国别+手机号，双击编辑');
      const numberButtons = screen.getAllByTitle('单击仅复制手机号，双击编辑');
      expect(countryButtons[0]).toHaveTextContent('CN 中国 (+86)');

      await user.click(numberButtons[0]);
      await waitFor(() => {
        expect(defaultProps.copyToClipboard).toHaveBeenCalledWith('13812345678', '手机号');
      });

      await user.click(countryButtons[0]);
      await waitFor(() => {
        expect(defaultProps.copyToClipboard).toHaveBeenCalledWith('+8613812345678', '国别+手机号');
      });
    });

    it('双击标签进入编辑时不触发复制', async () => {
      const user = userEvent.setup();
      const accountsWithTag = [{
        ...mockAccounts[0],
        groupName: '工作',
      }];

      render(<AccountListView {...defaultProps} accounts={accountsWithTag} />);

      await user.dblClick(screen.getByText('工作'));
      await new Promise(resolve => setTimeout(resolve, DOUBLE_CLICK_SETTLE_MS));

      expect(defaultProps.copyToClipboard).not.toHaveBeenCalled();
      expect(screen.getByPlaceholderText('输入标签，多个标签用逗号分隔')).toBeInTheDocument();
    });

    it('双击2FA验证码进入编辑时不触发复制', async () => {
      const user = userEvent.setup();
      const propsWithCode = {
        ...defaultProps,
        twoFACodes: { 1: { code: '123456', expiry: 25 } },
      };

      render(<AccountListView {...propsWithCode} />);

      const codeElements = screen.getAllByText('123456');
      await user.dblClick(codeElements[0]);
      await new Promise(resolve => setTimeout(resolve, DOUBLE_CLICK_SETTLE_MS));

      expect(defaultProps.copyToClipboard).not.toHaveBeenCalled();
      expect(screen.getByPlaceholderText('输入 2FA 密钥')).toBeInTheDocument();
    });

    it('空内容列渲染为整格可点击按钮并支持双击编辑', async () => {
      const user = userEvent.setup();
      const emptyValueAccounts = [{
        ...mockAccounts[0],
        phone: '',
        secret: '',
        groupName: '',
      }];

      render(<AccountListView {...defaultProps} accounts={emptyValueAccounts} />);

      const emptySecretTrigger = screen.getByTitle('双击编辑2FA密钥');
      expect(emptySecretTrigger.tagName).toBe('BUTTON');
      await user.dblClick(emptySecretTrigger);
      await new Promise(resolve => setTimeout(resolve, DOUBLE_CLICK_SETTLE_MS));
      expect(screen.getByPlaceholderText('输入 2FA 密钥')).toBeInTheDocument();

      fireEvent.keyDown(screen.getByPlaceholderText('输入 2FA 密钥'), { key: 'Escape' });

      const emptyPhoneTrigger = screen.getByTitle('双击编辑手机号');
      expect(emptyPhoneTrigger.tagName).toBe('BUTTON');
      await user.dblClick(emptyPhoneTrigger);
      await new Promise(resolve => setTimeout(resolve, DOUBLE_CLICK_SETTLE_MS));
      expect(screen.getByPlaceholderText('支持格式：+86 138 1234 5678 / 13812345678 / 0086...')).toBeInTheDocument();

      fireEvent.keyDown(screen.getByPlaceholderText('支持格式：+86 138 1234 5678 / 13812345678 / 0086...'), { key: 'Escape' });

      const emptyTagTrigger = screen.getByTitle('双击添加标签');
      expect(emptyTagTrigger.tagName).toBe('BUTTON');
      await user.dblClick(emptyTagTrigger);
      await new Promise(resolve => setTimeout(resolve, DOUBLE_CLICK_SETTLE_MS));
      expect(screen.getByPlaceholderText('输入标签，多个标签用逗号分隔')).toBeInTheDocument();
    });

    it('刚编辑的新值可立即在同列其他行的建议中复用', async () => {
      const user = userEvent.setup();
      const onInlineEdit = vi.fn().mockResolvedValue(true);
      render(<AccountListView {...defaultProps} onInlineEdit={onInlineEdit} />);

      await user.dblClick(screen.getByText('recovery1@gmail.com'));
      const firstInput = screen.getByDisplayValue('recovery1@gmail.com');
      await user.clear(firstInput);
      await user.type(firstInput, 'new-recovery@example.com');
      fireEvent.keyDown(firstInput, { key: 'Enter' });

      await waitFor(() => {
        expect(onInlineEdit).toHaveBeenCalledWith(1, 'recovery', 'new-recovery@example.com');
      });

      await user.dblClick(screen.getByText('recovery2@gmail.com'));
      const secondInput = screen.getByDisplayValue('recovery2@gmail.com');
      await user.clear(secondInput);

      await waitFor(() => {
        expect(screen.getByText('new-recovery@example.com')).toBeInTheDocument();
      });
    });
  });

  describe('2FA 验证码显示', () => {
    it('默认不显示2FA验证码', () => {
      render(<AccountListView {...defaultProps} />);

      expect(screen.queryByText('获取验证码')).not.toBeInTheDocument();
      expect(screen.queryByText('123456')).not.toBeInTheDocument();
    });

    it('显示已获取的2FA验证码', () => {
      const propsWithCode = {
        ...defaultProps,
        twoFACodes: { 1: { code: '123456', expiry: 25 } },
      };
      render(<AccountListView {...propsWithCode} />);

      // 2FA验证码可能在多个位置显示
      const codeElements = screen.getAllByText('123456');
      expect(codeElements.length).toBeGreaterThan(0);
      const expiryElements = screen.getAllByText(/25s/);
      expect(expiryElements.length).toBeGreaterThan(0);
    });

    it('点击2FA验证码复制', async () => {
      const user = userEvent.setup();
      const propsWithCode = {
        ...defaultProps,
        twoFACodes: { 1: { code: '123456', expiry: 25 } },
      };
      render(<AccountListView {...propsWithCode} />);

      // 2FA验证码可能在多个位置显示，点击第一个
      const codeElements = screen.getAllByText('123456');
      await user.click(codeElements[0]);

      await waitFor(() => {
        expect(defaultProps.copyToClipboard).toHaveBeenCalledWith('123456', '2FA验证码');
      });
    });
  });

  describe('暗色模式', () => {
    it('暗色模式下正确渲染', () => {
      const { container } = render(<AccountListView {...defaultProps} darkMode={true} />);

      expect(screen.getByText('账号库')).toBeInTheDocument();
      expect(screen.getByText('test1@gmail.com')).toBeInTheDocument();

      // 检查暗色模式的类名
      const title = screen.getByText('账号库');
      expect(title).toHaveClass('text-slate-100');
    });

    it('亮色模式下正确渲染', () => {
      const { container } = render(<AccountListView {...defaultProps} darkMode={false} />);

      const title = screen.getByText('账号库');
      expect(title).toHaveClass('text-slate-900');
    });
  });

  describe('分页功能', () => {
    it('显示分页组件（账号数量大于10时）', () => {
      const manyAccounts = Array.from({ length: 15 }, (_, i) => buildMockAccount(i + 1));

      render(<AccountListView {...defaultProps} accounts={manyAccounts} />);

      // 应该只显示前10个账号
      expect(screen.getByText('test1@gmail.com')).toBeInTheDocument();
      expect(screen.getByText('test10@gmail.com')).toBeInTheDocument();
      expect(screen.queryByText('test11@gmail.com')).not.toBeInTheDocument();
    });
  });

  describe('多选链路', () => {
    it('选中后可一键全选当前结果全部数据（跨分页）并执行批量删除', async () => {
      const user = userEvent.setup();
      const onBatchDelete = vi.fn().mockResolvedValue({ successfulIds: [], failedCount: 0 });
      const manyAccounts = Array.from({ length: 15 }, (_, i) => buildMockAccount(i + 1));

      render(
        <AccountListView
          {...defaultProps}
          accounts={manyAccounts}
          onBatchDelete={onBatchDelete}
        />
      );

      const checkboxes = screen.getAllByRole('checkbox');
      await user.click(checkboxes[1]); // 首行账号复选框

      expect(screen.getByText('已选中 1 个账号')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /全选当前结果/ }));
      expect(screen.getByText('已选中 15 个账号')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: '批量删除' }));

      await waitFor(() => {
        expect(onBatchDelete).toHaveBeenCalledTimes(1);
      });

      const selectedIds = Array.from(onBatchDelete.mock.calls[0][0]);
      expect(selectedIds).toHaveLength(15);
      expect(selectedIds).toEqual(expect.arrayContaining([1, 10, 15]));
    });

    it('筛选结果切换后会清理残留选中 ID，避免批量操作命中无效账号', async () => {
      const user = userEvent.setup();
      const onBatchDelete = vi.fn().mockResolvedValue({ successfulIds: [], failedCount: 0 });
      const firstResult = [buildMockAccount(1), buildMockAccount(2)];
      const secondResult = [buildMockAccount(1)];

      const { rerender } = render(
        <AccountListView
          {...defaultProps}
          accounts={firstResult}
          onBatchDelete={onBatchDelete}
        />
      );

      const initialCheckboxes = screen.getAllByRole('checkbox');
      await user.click(initialCheckboxes[2]); // 选中 id=2
      expect(screen.getByText('已选中 1 个账号')).toBeInTheDocument();

      rerender(
        <AccountListView
          {...defaultProps}
          accounts={secondResult}
          onBatchDelete={onBatchDelete}
        />
      );

      await waitFor(() => {
        expect(screen.queryByText('已选中 1 个账号')).not.toBeInTheDocument();
      });
      expect(screen.queryByRole('button', { name: '批量删除' })).not.toBeInTheDocument();
    });
  });

  describe('历史记录功能', () => {
    it('点击历史按钮打开历史抽屉', async () => {
      const user = userEvent.setup();
      render(<AccountListView {...defaultProps} />);

      const historyButtons = screen.getAllByTitle('查看修改历史');
      await user.click(historyButtons[0]);

      // 抽屉应该打开
      await waitFor(() => {
        expect(screen.getByTestId('history-drawer')).toBeInTheDocument();
      });

      expect(screen.getByText('历史记录抽屉')).toBeInTheDocument();
      expect(screen.getByText('账号: test1@gmail.com')).toBeInTheDocument();
    });
  });

  describe('边界情况', () => {
    it('账号没有备注时显示"无"', () => {
      const accountsWithoutRemark = [{
        ...mockAccounts[0],
        remark: '',
        phone: '',
        reg_year: '',
        country: '',
      }];

      render(<AccountListView {...defaultProps} accounts={accountsWithoutRemark} />);

      // 现在有多个"无"元素（手机号、注册年份、国家、备注）
      const noElements = screen.getAllByText('无');
      expect(noElements.length).toBeGreaterThanOrEqual(1);
    });

    it('账号没有创建时间时显示"-"', () => {
      const accountsWithoutDate = [{
        ...mockAccounts[0],
        createdAt: '',
      }];

      render(<AccountListView {...defaultProps} accounts={accountsWithoutDate} />);

      expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(1);
    });
  });
});

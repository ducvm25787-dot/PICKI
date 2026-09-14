"use client";

function PencilIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0 0-3L16.5 4.5a2.1 2.1 0 0 0-3 0L3 15v5z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M13.5 6.5l4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

type AddressActionsMenuProps = {
  open: boolean;
  canDelete: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  /** Future: open map picker to set address coordinates */
  onMapPin?: () => void;
};

export function AddressActionsMenu({
  open,
  canDelete,
  onToggle,
  onEdit,
  onDelete,
  onMapPin,
}: AddressActionsMenuProps) {
  return (
    <div className="address-actions">
      <button
        type="button"
        className="icon-btn"
        aria-label="Tuỳ chọn địa chỉ"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        <PencilIcon />
      </button>
      {open ? (
        <div className="address-action-menu" role="menu" onClick={(e) => e.stopPropagation()}>
          <button type="button" role="menuitem" className="address-action-menu-item" onClick={onEdit}>
            Sửa
          </button>
          {onMapPin ? (
            <button type="button" role="menuitem" className="address-action-menu-item" onClick={onMapPin}>
              Định vị trên bản đồ
            </button>
          ) : null}
          {canDelete ? (
            <button
              type="button"
              role="menuitem"
              className="address-action-menu-item address-action-menu-item-danger"
              onClick={onDelete}
            >
              Xóa
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

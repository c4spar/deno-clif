import type { KeyCode } from "../keycode/key_code.ts";
import {
  GenericInput,
  GenericInputKeys,
  GenericInputPromptOptions,
  GenericInputPromptSettings,
} from "./_generic_input.ts";
import { bold, brightBlue, dim, stripColor, yellow } from "./deps.ts";
import { Figures, getFiguresByKeys } from "./figures.ts";
import { distance } from "../_utils/distance.ts";

type UnsupportedInputOptions = "suggestions" | "list";

/** Generic list prompt options. */
export interface GenericListOptions<TValue, TRawValue> extends
  Omit<
    GenericInputPromptOptions<TValue, TRawValue>,
    UnsupportedInputOptions
  > {
  options: Array<string | GenericListOption>;
  keys?: GenericListKeys;
  indent?: string;
  listPointer?: string;
  searchIcon?: string;
  maxRows?: number;
  searchLabel?: string;
  search?: boolean;
  info?: boolean;
  maxBreadcrumbItems?: number;
  breadcrumbSeparator?: string;
}

/** Generic list prompt settings. */
export interface GenericListSettings<
  TValue,
  TRawValue,
  TOption extends GenericListOptionSettings,
> extends GenericInputPromptSettings<TValue, TRawValue> {
  options: Array<TOption>;
  keys?: GenericListKeys;
  indent: string;
  listPointer: string;
  maxRows: number;
  searchLabel: string;
  search?: boolean;
  info?: boolean;
  maxBreadcrumbItems: number;
  breadcrumbSeparator: string;
  backPointer: string;
  groupPointer: string;
  groupIcon: string;
  groupOpenIcon: string;
}

/** Generic list option options. */
export interface GenericListOption {
  value: string;
  name?: string;
  disabled?: boolean;
  options?: Array<string | GenericListOption>;
}

/** Generic list option settings. */
export interface GenericListOptionSettings extends GenericListOption {
  name: string;
  value: string;
  disabled: boolean;
  indentLevel: number;
  options: Array<this>;
}

/** GenericList key options. */
export interface GenericListKeys extends GenericInputKeys {
  previous?: string[];
  next?: string[];
  previousPage?: string[];
  nextPage?: string[];
}

interface SortedOption<TOption extends GenericListOptionSettings> {
  originalOption: TOption;
  distance: number;
  children: Array<SortedOption<TOption>>;
}

export interface ParentOptions<TOption extends GenericListOptionSettings> {
  options: Array<TOption>;
  selectedCategoryIndex: number;
}

/** Generic list prompt representation. */
export abstract class GenericList<
  TValue,
  TRawValue,
  TOption extends GenericListOptionSettings,
> extends GenericInput<TValue, TRawValue> {
  protected abstract readonly settings: GenericListSettings<
    TValue,
    TRawValue,
    TOption
  >;
  protected abstract options: Array<TOption>;
  protected abstract parentOptions: Array<ParentOptions<TOption>>;
  protected abstract listIndex: number;
  protected abstract listOffset: number;
  #backButton: TOption = {
    name: "",
    value: "",
    options: [],
    disabled: false,
    indentLevel: 0,
  } as unknown as TOption;

  /**
   * Create list separator.
   * @param label Separator label.
   */
  public static separator(label = "------------"): GenericListOption {
    return { value: label, disabled: true };
  }

  protected getDefaultSettings(
    options: GenericListOptions<TValue, TRawValue>,
  ): GenericListSettings<TValue, TRawValue, TOption> {
    const settings = super.getDefaultSettings(options);
    return {
      listPointer: brightBlue(Figures.POINTER),
      searchLabel: brightBlue(Figures.SEARCH),
      backPointer: brightBlue(Figures.LEFT_POINTER),
      groupPointer: brightBlue(Figures.POINTER),
      groupIcon: Figures.FOLDER,
      groupOpenIcon: Figures.FOLDER_OPEN,
      maxBreadcrumbItems: 5,
      breadcrumbSeparator: "›",
      ...settings,
      maxRows: options.maxRows ?? 10,
      options: this.mapOptions(options, options.options),
      keys: {
        previous: options.search ? ["up"] : ["up", "u", "p", "8"],
        next: options.search ? ["down"] : ["down", "d", "n", "2"],
        previousPage: ["pageup", "left"],
        nextPage: ["pagedown", "right"],
        ...(settings.keys ?? {}),
      },
    };
  }

  protected abstract mapOptions(
    promptOptions: GenericListOptions<TValue, TRawValue>,
    options: Array<string | GenericListOption>,
  ): Array<TOption>;

  /**
   * Set list option defaults.
   * @param option List option.
   */
  protected mapOption(
    options: GenericListOptions<TValue, TRawValue>,
    option: GenericListOption,
    recursive = true,
  ): GenericListOptionSettings {
    return {
      value: option.value,
      name: typeof option.name === "undefined" ? option.value : option.name,
      disabled: !!option.disabled,
      indentLevel: 0,
      options: recursive && option.options
        ? this.mapOptions(options, option.options)
        : [],
    };
  }

  protected flatOptions(
    options: Array<TOption>,
    groups = true,
  ): Array<TOption> {
    const opts = [];

    for (const option of options) {
      if (groups) {
        opts.push(option);
      }
      if (option.options) {
        opts.push(...this.flatOptions(option.options));
      }
    }

    return opts;
  }

  protected match(): void {
    const input: string = this.getCurrentInputValue().toLowerCase();

    if (!input.length) {
      this.options = this.getCurrentOptions().slice();
      if (this.hasParent()) {
        this.options.unshift(this.#backButton);
      }
    } else {
      const sortedHits = this.findSearchHits(input, this.getCurrentOptions());
      this.options = this.buildSearchResultsToDisplay(sortedHits);
    }

    const firstOptionIndex = this.options.findIndex((option) =>
      !option.disabled && !this.isBackButton(option)
    );

    this.listIndex = Math.max(
      firstOptionIndex,
      Math.min(this.options.length - 1, this.listIndex),
    );

    this.listOffset = Math.max(
      0,
      Math.min(
        this.options.length - this.getListHeight(),
        this.listOffset,
      ),
    );
  }

  protected getCurrentOptions(): Array<TOption> {
    return this.getParentOption()?.options ?? this.settings.options;
  }

  protected getParentOption(index = -1): TOption | undefined {
    const group = this.parentOptions.at(index);
    return group?.options.at(group.selectedCategoryIndex);
  }

  private findSearchHits(
    searchInput: string,
    options: Array<TOption>,
  ): Array<SortedOption<TOption>> {
    return options
      .map((opt) => {
        if (this.isGroup(opt)) {
          const sortedChildHits = this
            .findSearchHits(searchInput, opt.options)
            .sort(sortByDistance);

          if (sortedChildHits.length === 0) {
            return [];
          }

          return [{
            originalOption: opt,
            distance: Math.min(...sortedChildHits.map((item) => item.distance)),
            children: sortedChildHits,
          }];
        }

        if (this.matchesOption(searchInput, opt)) {
          return [{
            originalOption: opt,
            distance: distance(opt.name, searchInput),
            children: [],
          }];
        }

        return [];
      })
      .flat()
      .sort(sortByDistance);

    function sortByDistance(
      a: SortedOption<TOption>,
      b: SortedOption<TOption>,
    ): number {
      return a.distance - b.distance;
    }
  }

  private buildSearchResultsToDisplay(
    sortedOptions: Array<SortedOption<TOption>>,
  ): Array<TOption> {
    return sortedOptions
      .map((option) => this.buildSearchResultHelper(0, option))
      .flat();
  }

  private buildSearchResultHelper(
    indentLevel: number,
    sortedItem: SortedOption<TOption>,
  ): Array<TOption> {
    if (sortedItem.children.length > 0) {
      const sortedChildItems = sortedItem.children
        .map((nextLevelOption) =>
          this.buildSearchResultHelper(indentLevel + 1, nextLevelOption)
        )
        .flat();

      const itemForCategoryInSearchResult: TOption = {
        ...sortedItem.originalOption,
        name: dim(sortedItem.originalOption.name),
        disabled: true,
        indentLevel: indentLevel,
      };

      return [itemForCategoryInSearchResult, ...sortedChildItems];
    } else {
      sortedItem.originalOption.indentLevel = indentLevel;
      return [sortedItem.originalOption];
    }
  }

  private matchesOption(
    inputString: string,
    option: TOption,
  ): boolean {
    return this.matchInput(inputString, option.name) ||
      (option.name !== option.value &&
        this.matchInput(inputString, option.value));
  }

  private matchInput(inputString: string, value: string): boolean {
    return stripColor(value)
      .toLowerCase()
      .includes(inputString);
  }

  protected getBreadCrumb() {
    const parentsCount = this.parentOptions.length;
    const maxItems = this.settings.maxBreadcrumbItems;

    if (parentsCount === 0 || maxItems === 0) {
      return "";
    }
    const parentOptions = parentsCount > maxItems
      ? [this.parentOptions[0], ...this.parentOptions.slice(-maxItems + 1)]
      : this.parentOptions;

    const breadCrumb = parentOptions.map(({ options, selectedCategoryIndex }) =>
      options[selectedCategoryIndex].name
    );

    if (parentsCount > maxItems) {
      breadCrumb.splice(1, 0, "..");
    }

    return breadCrumb.join(` ${this.settings.breadcrumbSeparator} `);
  }

  protected async submit(): Promise<void> {
    const selectedOption = this.options[this.listIndex];

    if (this.isBackButton(selectedOption)) {
      this.submitBackButton();
    } else if (this.isGroup(selectedOption)) {
      this.submitGroupOption(selectedOption);
    } else {
      await super.submit();
    }
  }

  protected submitBackButton() {
    const previousLevel = this.parentOptions.pop();
    if (!previousLevel) {
      return;
    }
    this.options = previousLevel.options;
    this.listIndex = previousLevel.selectedCategoryIndex;
    this.listOffset = 0;
  }

  protected submitGroupOption(selectedOption: TOption) {
    this.parentOptions.push({
      options: this.options,
      selectedCategoryIndex: this.listIndex,
    });
    this.options = [
      this.#backButton,
      ...selectedOption.options,
    ];
    this.listIndex = 1;
    this.listOffset = 0;
  }

  protected isGroup(option: TOption): boolean {
    return option.options.length > 0;
  }

  protected isBackButton(option: TOption): boolean {
    return option === this.#backButton;
  }

  protected hasParent(): boolean {
    return this.parentOptions.length > 0;
  }

  protected isSearching(): boolean {
    return this.getCurrentInputValue() !== "";
  }

  protected message(): string {
    let message = `${this.settings.indent}${this.settings.prefix}` +
      bold(this.settings.message) +
      this.defaults();
    if (this.settings.search) {
      message += " " + this.settings.searchLabel + " ";
    }
    this.cursor.x = stripColor(message).length + this.inputIndex + 1;
    return message + this.input();
  }

  /** Render options. */
  protected body(): string | Promise<string> {
    return this.getList() + this.getInfo();
  }

  protected getInfo(): string {
    if (!this.settings.info) {
      return "";
    }
    const selected: number = this.listIndex + 1;
    const actions: Array<[string, Array<string>]> = [
      ["Next", getFiguresByKeys(this.settings.keys?.next ?? [])],
      ["Previous", getFiguresByKeys(this.settings.keys?.previous ?? [])],
      ["Next Page", getFiguresByKeys(this.settings.keys?.nextPage ?? [])],
      [
        "Previous Page",
        getFiguresByKeys(this.settings.keys?.previousPage ?? []),
      ],
      ["Submit", getFiguresByKeys(this.settings.keys?.submit ?? [])],
    ];

    return "\n" + this.settings.indent + brightBlue(Figures.INFO) +
      bold(` ${selected}/${this.options.length} `) +
      actions
        .map((cur) => `${cur[0]}: ${bold(cur[1].join(", "))}`)
        .join(", ");
  }

  /** Render options list. */
  protected getList(): string {
    const list: Array<string> = [];
    const height: number = this.getListHeight();
    for (let i = this.listOffset; i < this.listOffset + height; i++) {
      list.push(
        this.getListItem(
          this.options[i],
          this.listIndex === i,
        ),
      );
    }
    if (!list.length) {
      list.push(
        this.settings.indent + dim("  No matches..."),
      );
    }
    return list.join("\n");
  }

  /**
   * Render option.
   * @param option        Option.
   * @param isSelected  Set to true if option is selected.
   */
  protected getListItem(option: TOption, isSelected?: boolean): string {
    let line = this.getListItemIndent(option);
    line += this.getListItemPointer(option, isSelected);
    line += this.getListItemIcon(option);
    line += this.getListItemValue(option, isSelected);

    return line;
  }

  protected getListItemIndent(option: TOption) {
    const indentLevel = this.isSearching()
      ? option.indentLevel
      : this.hasParent() && !this.isBackButton(option)
      ? 1
      : 0;

    return this.settings.indent + " ".repeat(indentLevel);
  }

  protected getListItemPointer(option: TOption, isSelected?: boolean) {
    if (!isSelected) {
      return "  ";
    }

    if (this.isBackButton(option)) {
      return this.settings.backPointer + " ";
    } else if (this.isGroup(option)) {
      return this.settings.groupPointer + " ";
    }

    return this.settings.listPointer + " ";
  }

  protected getListItemIcon(option: TOption): string {
    if (this.isBackButton(option)) {
      return this.settings.groupOpenIcon + " ";
    } else if (this.isGroup(option)) {
      return this.settings.groupIcon + " ";
    }

    return "";
  }

  protected getListItemValue(option: TOption, isSelected?: boolean): string {
    let value = this.isBackButton(option) ? this.getBreadCrumb() : option.name;

    if (this.isBackButton(option)) {
      value = bold(
        isSelected && !option.disabled ? yellow(value) : dim(value),
      );
    } else {
      value = isSelected && !option.disabled
        ? this.highlight(value, (val) => val)
        : this.highlight(value);

      value = this.isGroup(option) ? bold(value) : value;
    }

    return value;
  }

  /** Get options row height. */
  protected getListHeight(): number {
    return Math.min(
      this.options.length,
      this.settings.maxRows || this.options.length,
    );
  }

  protected getListIndex(value?: string) {
    return Math.max(
      0,
      typeof value === "undefined"
        ? this.options.findIndex((option: TOption) => !option.disabled) || 0
        : this.options.findIndex((option: TOption) => option.value === value) ||
          0,
    );
  }

  protected getPageOffset(index: number) {
    if (index === 0) {
      return 0;
    }
    const height: number = this.getListHeight();
    return Math.floor(index / height) * height;
  }

  /**
   * Find option by value.
   * @param value Value of the option.
   */
  protected getOptionByValue(
    value: string,
  ): TOption | undefined {
    return this.options.find((option) => option.value === value);
  }

  /** Read user input. */
  protected read(): Promise<boolean> {
    if (!this.settings.search) {
      this.tty.cursorHide();
    }
    return super.read();
  }

  /**
   * Handle user input event.
   * @param event Key event.
   */
  protected async handleEvent(event: KeyCode): Promise<void> {
    switch (true) {
      case this.isKey(this.settings.keys, "previous", event):
        this.selectPrevious();
        break;
      case this.isKey(this.settings.keys, "next", event):
        this.selectNext();
        break;
      case this.isKey(this.settings.keys, "nextPage", event):
        this.selectNextPage();
        break;
      case this.isKey(this.settings.keys, "previousPage", event):
        this.selectPreviousPage();
        break;
      default:
        await super.handleEvent(event);
    }
  }

  protected moveCursorLeft(): void {
    if (this.settings.search) {
      super.moveCursorLeft();
    }
  }

  protected moveCursorRight(): void {
    if (this.settings.search) {
      super.moveCursorRight();
    }
  }

  protected deleteChar(): void {
    if (this.settings.search) {
      super.deleteChar();
    }
  }

  protected deleteCharRight(): void {
    if (this.settings.search) {
      super.deleteCharRight();
      this.match();
    }
  }

  protected addChar(char: string): void {
    if (this.settings.search) {
      super.addChar(char);
      this.match();
    }
  }

  /** Select previous option. */
  protected selectPrevious(): void {
    if (this.options.length < 2) {
      return;
    }
    if (this.listIndex > 0) {
      this.listIndex--;
      if (this.listIndex < this.listOffset) {
        this.listOffset--;
      }
      if (this.options[this.listIndex].disabled) {
        this.selectPrevious();
      }
    } else {
      this.listIndex = this.options.length - 1;
      this.listOffset = this.options.length - this.getListHeight();
      if (this.options[this.listIndex].disabled) {
        this.selectPrevious();
      }
    }
  }

  /** Select next option. */
  protected selectNext(): void {
    if (this.options.length < 2) {
      return;
    }
    if (this.listIndex < this.options.length - 1) {
      this.listIndex++;
      if (this.listIndex >= this.listOffset + this.getListHeight()) {
        this.listOffset++;
      }
      if (this.options[this.listIndex].disabled) {
        this.selectNext();
      }
    } else {
      this.listIndex = this.listOffset = 0;
      if (this.options[this.listIndex].disabled) {
        this.selectNext();
      }
    }
  }

  /** Select previous page. */
  protected selectPreviousPage(): void {
    if (this.options?.length) {
      const height: number = this.getListHeight();
      if (this.listOffset >= height) {
        this.listIndex -= height;
        this.listOffset -= height;
      } else if (this.listOffset > 0) {
        this.listIndex -= this.listOffset;
        this.listOffset = 0;
      }
    }
  }

  /** Select next page. */
  protected selectNextPage(): void {
    if (this.options?.length) {
      const height: number = this.getListHeight();
      if (this.listOffset + height + height < this.options.length) {
        this.listIndex += height;
        this.listOffset += height;
      } else if (this.listOffset + height < this.options.length) {
        const offset = this.options.length - height;
        this.listIndex += offset - this.listOffset;
        this.listOffset = offset;
      }
    }
  }
}

/** @deprecated Use `Array<string | GenericListOption>` instead. */
export type GenericListValueOptions = Array<string | GenericListOption>;
/** @deprecated Use `Array<GenericListOptionSettings>` instead. */
export type GenericListValueSettings = Array<GenericListOptionSettings>;

import { blue, dim, green, red } from 'https://deno.land/std@v0.61.0/fmt/colors.ts';
import { KeyEvent } from '../../keycode/mod.ts';
import { Figures } from '../lib/figures.ts';
import { GenericList, GenericListOption, GenericListOptions, GenericListOptionSettings, GenericListSettings } from '../lib/generic-list.ts';
import { GenericPrompt } from '../lib/generic-prompt.ts';

export interface CheckboxOption extends GenericListOption {
    checked?: boolean;
    icon?: boolean;
}

export interface CheckboxOptionSettings extends GenericListOptionSettings {
    checked: boolean;
    icon: boolean;
}

export interface CheckboxKeys {
    previous?: string[];
    next?: string[];
    submit?: string[];
    check?: string[];
}

interface CheckboxKeysSettings extends Required<CheckboxKeys> {}

export type CheckboxValueOptions = ( string | CheckboxOption )[];
export type CheckboxValueSettings = CheckboxOptionSettings[];

export interface CheckboxOptions extends GenericListOptions<string[], string[]> {
    options: CheckboxValueOptions;
    check?: string;
    uncheck?: string;
    minOptions?: number;
    maxOptions?: number;
    keys?: CheckboxKeys;
}

interface CheckboxSettings extends GenericListSettings<string[], string[]> {
    options: CheckboxValueSettings;
    check: string;
    uncheck: string;
    minOptions: number;
    maxOptions: number;
    keys: CheckboxKeysSettings;
}

export class Checkbox extends GenericList<string[], string[], CheckboxSettings> {

    public static inject( value: string[] ): void {
        GenericPrompt.inject( value );
    }

    public static async prompt( options: CheckboxOptions ): Promise<string[]> {

        const items: CheckboxOption[] = this.mapValues( options.options );
        const values: CheckboxValueSettings = items.map( item => this.mapItem( item, options.default ) );

        return new this( {
            pointer: blue( Figures.POINTER_SMALL ),
            listPointer: blue( Figures.POINTER ),
            indent: ' ',
            maxRows: 10,
            minOptions: 0,
            maxOptions: Infinity,
            check: green( Figures.TICK ),
            uncheck: red( Figures.CROSS ),
            ...options,
            keys: {
                previous: [ 'up' ],
                next: [ 'down' ],
                submit: [ 'return', 'enter' ],
                check: [ 'space' ],
                ...( options.keys ?? {} )
            },
            options: values
        } ).prompt();
    }

    public static separator( label: string = '------------' ): CheckboxOption {
        return {
            ...super.separator(),
            icon: false
        };
    }

    protected static mapValues( optValues: CheckboxValueOptions ): CheckboxOption[] {
        return super.mapValues( optValues ) as CheckboxOption[];
    }

    protected static mapItem( item: CheckboxOption, defaults?: string[] ): CheckboxOptionSettings {
        return {
            ...super.mapItem( item ),
            checked: typeof item.checked === 'undefined' && defaults && defaults.indexOf( item.value ) !== -1 ? true : !!item.checked,
            icon: typeof item.icon === 'undefined' ? true : item.icon
        };
    }

    protected async handleEvent( event: KeyEvent ): Promise<boolean> {

        switch ( true ) {

            case event.name === 'c':
                // @TODO: implement Deno.Signal?: https://deno.land/std/manual.md#handle-os-signals
                if ( event.ctrl ) {
                    return Deno.exit( 0 );
                }
                break;

            case this.isKey( this.settings.keys, 'previous', event ):
                await this.selectPrevious();
                break;

            case this.isKey( this.settings.keys, 'next', event ):
                await this.selectNext();
                break;

            case this.isKey( this.settings.keys, 'check', event ):
                this.checkValue();
                break;

            case this.isKey( this.settings.keys, 'submit', event ):
                return true;
        }

        return false;
    }

    protected checkValue() {
        const item = this.settings.options[ this.selected ];
        item.checked = !item.checked;
    }

    protected getValue(): string[] {
        return this.settings.options
            .filter( item => item.checked )
            .map( item => item.value );
    }

    protected writeListItem( item: CheckboxOptionSettings, isSelected?: boolean ) {

        let line = this.settings.indent;

        // pointer
        line += isSelected ? `${ this.settings.listPointer } ` : '  ';

        // icon
        if ( item.icon ) {
            let check = item.checked ? `${ this.settings.check } ` : `${ this.settings.uncheck } `;
            if ( item.disabled ) {
                check = dim( check );
            }
            line += check;
        } else {
            line += '  ';
        }

        // value
        const value: string = item.name;
        line += `${ isSelected ? value : dim( value ) }`;

        this.writeLine( line );
    }

    protected validate( value: string[] ): boolean | string {

        const isValidValue = Array.isArray( value ) && value.every( val =>
            typeof val === 'string' &&
            val.length > 0 &&
            this.settings.options.findIndex( option => option.value === val ) !== -1 );

        if ( !isValidValue ) {
            return false;
        }

        if ( value.length < this.settings.minOptions ) {
            return `The minimum number of options is ${ this.settings.minOptions } but got ${ value.length }.`;
        }
        if ( value.length > this.settings.maxOptions ) {
            return `The maximum number of options is ${ this.settings.maxOptions } but got ${ value.length }.`;
        }

        return true;
    }

    protected transform( value: string[] ): string[] {
        return value.map( val => val.trim() );
    }

    protected format( value: string[] ): string {
        return value.join( ', ' );
    }
}
